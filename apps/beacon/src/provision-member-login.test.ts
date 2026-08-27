import { describe, it, expect } from "vitest";
import {
  validateProvisionInput,
  nextClaims,
  provisionMember,
  type ProvisionDeps,
  type ProvisionUser,
} from "./provision-member-login.js";

describe("validateProvisionInput", () => {
  it("accepts a clean memberId", () => {
    expect(validateProvisionInput({ memberId: "m-1" })).toEqual({ memberId: "m-1" });
  });
  it("rejects missing / empty / unclean memberId", () => {
    expect(() => validateProvisionInput({})).toThrow();
    expect(() => validateProvisionInput({ memberId: "" })).toThrow();
    expect(() => validateProvisionInput({ memberId: "a/b" })).toThrow();
  });
});

describe("nextClaims", () => {
  it("adds Member to empty claims", () => {
    expect(nextClaims(undefined, "Member")).toEqual({ roles: ["Member"] });
  });
  it("merges Member without clobbering existing roles", () => {
    expect(nextClaims({ roles: ["ProjectManager"] }, "Member")).toEqual({
      roles: ["ProjectManager", "Member"],
    });
  });
  it("is idempotent when the role is already present", () => {
    expect(nextClaims({ roles: ["Member"] }, "Member")).toEqual({ roles: ["Member"] });
  });
});

function fakeDeps(opts: {
  member?: Record<string, unknown> | null;
  usersByEmail?: Record<string, ProvisionUser>;
}) {
  const calls = { createUser: [] as string[], setClaims: [] as string[], linkUid: [] as string[] };
  const users = opts.usersByEmail ?? {};
  const deps: ProvisionDeps = {
    getMember: async () => opts.member ?? null,
    getUserByEmail: async (email) => users[email] ?? null,
    createUser: async (email) => {
      calls.createUser.push(email);
      const user = { uid: `new-${email}`, email };
      users[email] = user;
      return user;
    },
    setClaims: async (uid) => {
      calls.setClaims.push(uid);
    },
    linkUid: async (_memberId, uid) => {
      calls.linkUid.push(uid);
    },
    getUserByUid: async (uid) => Object.values(users).find((u) => u.uid === uid) ?? null,
    passwordResetLink: async (email) => `link:${email}`,
  };
  return { deps, calls };
}

describe("provisionMember", () => {
  const active = { email: "a@b.co", active: true };

  it("rejects when the member is already linked to a DIFFERENT live auth user (email changed)", async () => {
    const { deps, calls } = fakeDeps({
      member: { ...active, uid: "old-uid" },
      usersByEmail: { "a@b.co": { uid: "other-uid" }, "old@x.co": { uid: "old-uid" } },
    });
    await expect(provisionMember(deps, "m1")).rejects.toMatchObject({
      code: "failed-precondition",
      details: { reason: "linked-to-different-login" },
    });
    expect(calls.createUser).toEqual([]);
    expect(calls.setClaims).toEqual([]);
    expect(calls.linkUid).toEqual([]);
  });

  it("rejects when the linked account is live but the email resolves nothing (would mint a duplicate)", async () => {
    const { deps, calls } = fakeDeps({
      member: { ...active, uid: "old-uid" },
      usersByEmail: { "old@x.co": { uid: "old-uid" } },
    });
    await expect(provisionMember(deps, "m1")).rejects.toMatchObject({
      code: "failed-precondition",
    });
    expect(calls.createUser).toEqual([]);
    expect(calls.linkUid).toEqual([]);
  });

  it("self-heals a stale link when the linked account was deleted — adopts by email, de-elevated", async () => {
    // ADMIN caller. The self-heal is an adoption too — it binds an account this member was
    // never linked to — so it sits behind the same guard, and deliberately: `email` is not
    // pinned on the members update arm either, so an update:Member delegate could retarget an
    // already-linked member at an Admin's mailbox and reach this branch whenever the stale
    // link happens to be dead. Recovery from a deleted account stays an Admin op.
    const { deps, calls } = fakeDeps({
      member: { ...active, uid: "dead-uid" },
      usersByEmail: {
        "a@b.co": { uid: "u2", email: "a@b.co", customClaims: { roles: ["Admin"] } },
      },
    });
    const result = await provisionMember(deps, "m1", true);
    expect(result.email).toBe("a@b.co");
    expect(calls.createUser).toEqual([]);
    expect(calls.linkUid).toEqual(["u2"]);
  });

  it("self-heals a stale link by minting a fresh account when the email resolves nothing", async () => {
    // ADMIN caller: a stored uid means this member was provisioned once already, so recovery
    // is an Admin op. A delegate hits the reprovision guard instead (test below).
    const { deps, calls } = fakeDeps({ member: { ...active, uid: "dead-uid" } });
    await provisionMember(deps, "m1", true);
    expect(calls.createUser).toEqual(["a@b.co"]);
    expect(calls.linkUid).toEqual(["new-a@b.co"]);
  });

  it("re-provisions idempotently when the stored uid matches the resolved user (resend invite)", async () => {
    // ADMIN caller. Resend returns a live password-reset link for the member's address, so it
    // is Admin-only — see the non-Admin BLOCKING case below.
    const { deps, calls } = fakeDeps({
      member: { ...active, uid: "u1" },
      usersByEmail: { "a@b.co": { uid: "u1", email: "a@b.co" } },
    });
    const result = await provisionMember(deps, "m1", true);
    expect(result).toEqual({ email: "a@b.co", actionLink: "link:a@b.co" });
    expect(calls.createUser).toEqual([]);
    expect(calls.setClaims).toEqual(["u1"]);
    expect(calls.linkUid).toEqual(["u1"]);
  });

  it("provisions an unlinked member, creating the auth user when absent", async () => {
    const { deps, calls } = fakeDeps({ member: active });
    const result = await provisionMember(deps, "m1");
    expect(result).toEqual({ email: "a@b.co", actionLink: "link:a@b.co" });
    expect(calls.createUser).toEqual(["a@b.co"]);
    expect(calls.setClaims).toEqual(["new-a@b.co"]);
    expect(calls.linkUid).toEqual(["new-a@b.co"]);
  });

  it("reuses an existing auth user for an unlinked member (pre-created account)", async () => {
    // ADMIN caller: adoption is the documented recovery op and stays open for the Admin role.
    // The `true` is load-bearing — the same call with `false` is the takedown case below.
    const { deps, calls } = fakeDeps({
      member: active,
      usersByEmail: {
        "a@b.co": { uid: "u9", email: "a@b.co", customClaims: { roles: ["Scanner"] } },
      },
    });
    await provisionMember(deps, "m1", true);
    expect(calls.createUser).toEqual([]);
    expect(calls.linkUid).toEqual(["u9"]);
  });

  it("BLOCKING: a non-Admin caller may NOT adopt a pre-existing unlinked account", async () => {
    // The takeover this guard closes: firestore.rules never constrains members.email and
    // there is no uniqueness check, so a create:Member + create:MemberLogin delegate could
    // file a member doc carrying a sitting Admin's email. Reaching the writes below would
    // strip that Admin's claims (adoptedClaims), bind their uid to the attacker's member doc
    // through the admin SDK, and hand back a password-reset link for their mailbox.
    // Same fixture as "reuses an existing auth user for an unlinked member" one test above —
    // the ONLY difference is the caller's privilege.
    const { deps, calls } = fakeDeps({
      member: active,
      usersByEmail: {
        "a@b.co": { uid: "u9", email: "a@b.co", customClaims: { roles: ["Admin"] } },
      },
    });
    await expect(provisionMember(deps, "m1", false)).rejects.toMatchObject({
      code: "permission-denied",
    });
    // Nothing partial: no claim write, no uid link, no reset link generated.
    expect(calls.setClaims).toEqual([]);
    expect(calls.linkUid).toEqual([]);
    expect(calls.createUser).toEqual([]);
  });

  it("still lets a non-Admin caller mint a BRAND-NEW account", async () => {
    // The delegation costs nothing on the path it is actually for: a genuinely new member
    // has neither an Auth account nor a stored uid.
    const fresh = fakeDeps({ member: active });
    await expect(provisionMember(fresh.deps, "m1", false)).resolves.toEqual({
      email: "a@b.co",
      actionLink: "link:a@b.co",
    });
    expect(fresh.calls.createUser).toEqual(["a@b.co"]);
  });

  it("BLOCKING: a non-Admin caller may NOT re-provision an ALREADY-LINKED member", async () => {
    // The resend path is an account-takeover primitive, not a convenience. passwordResetLink
    // is generatePasswordResetLink — it hands the oobCode URL to the CALLER, unlike the
    // client-side sendPasswordResetEmail which delivers it to the mailbox owner. So without
    // this, a create:MemberLogin holder could pass the president's memberId, receive a live
    // reset link for their address, and sign in as them. No adoption, no forged email —
    // every other guard satisfied.
    const { deps, calls } = fakeDeps({
      member: { ...active, uid: "u1" },
      usersByEmail: {
        "a@b.co": { uid: "u1", email: "a@b.co", customClaims: { roles: ["Admin"] } },
      },
    });
    await expect(provisionMember(deps, "m1", false)).rejects.toMatchObject({
      code: "permission-denied",
    });
    expect(calls.setClaims).toEqual([]);
    expect(calls.linkUid).toEqual([]);
  });

  it("BLOCKING: a non-Admin caller may NOT provision a member whose uid is set but account is gone", async () => {
    // The self-heal branch: linkedUid points at a deleted account, so getUserByEmail may
    // return null and the adoption half alone would let this through. A stored uid means an
    // Admin already provisioned this member once — recovery is theirs.
    const { deps, calls } = fakeDeps({ member: { ...active, uid: "dead-uid" } });
    await expect(provisionMember(deps, "m1", false)).rejects.toMatchObject({
      code: "permission-denied",
    });
    expect(calls.createUser).toEqual([]);
  });

  it("defaults callerIsAdmin to false — a new call site must opt into adoption", async () => {
    // The parameter defaults closed so an added caller that forgets it gets the SAFE path.
    const { deps } = fakeDeps({
      member: active,
      usersByEmail: { "a@b.co": { uid: "u9", email: "a@b.co" } },
    });
    await expect(provisionMember(deps, "m1")).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("rejects a missing / inactive / email-less member", async () => {
    await expect(provisionMember(fakeDeps({ member: null }).deps, "m1")).rejects.toMatchObject({
      code: "not-found",
    });
    await expect(
      provisionMember(fakeDeps({ member: { email: "a@b.co", active: false } }).deps, "m1"),
    ).rejects.toMatchObject({ code: "failed-precondition" });
    await expect(
      provisionMember(fakeDeps({ member: { active: true } }).deps, "m1"),
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });
});

// Every case here exercises the ADOPTION path, which is Admin-only — hence the explicit
// `true` third argument throughout. A non-Admin caller is refused before any of this runs
// (see "a non-Admin caller may NOT adopt a pre-existing unlinked account").
describe("provisionMember — stale-claims bootstrap (fresh adopt)", () => {
  it("strips stale org roles when adopting a pre-existing auth account, keeping Scanner", async () => {
    const claimsWrites: Record<string, unknown>[] = [];
    const { deps } = fakeDeps({
      member: { email: "a@b.co", active: true },
      usersByEmail: {
        "a@b.co": {
          uid: "orphan",
          email: "a@b.co",
          customClaims: { roles: ["Admin", "Scanner"] },
        },
      },
    });
    const spied: ProvisionDeps = {
      ...deps,
      setClaims: async (_uid, claims) => {
        claimsWrites.push(claims);
      },
    };
    await provisionMember(spied, "m1", true);
    expect(claimsWrites).toEqual([{ roles: ["Scanner", "Member"] }]);
  });

  it("de-elevates when replacing a stale link with a different live account", async () => {
    const claimsWrites: Record<string, unknown>[] = [];
    const { deps } = fakeDeps({
      member: { email: "a@b.co", active: true, uid: "dead-uid" },
      usersByEmail: {
        "a@b.co": { uid: "u2", email: "a@b.co", customClaims: { roles: ["Admin", "Member"] } },
      },
    });
    const spied: ProvisionDeps = {
      ...deps,
      setClaims: async (_uid, claims) => {
        claimsWrites.push(claims);
      },
    };
    await provisionMember(spied, "m1", true);
    expect(claimsWrites).toEqual([{ roles: ["Member"] }]);
  });

  it("keeps merge semantics on a same-uid re-provision (linked member, claims-sync owns them)", async () => {
    const claimsWrites: Record<string, unknown>[] = [];
    const { deps } = fakeDeps({
      member: { email: "a@b.co", active: true, uid: "u1" },
      usersByEmail: {
        "a@b.co": { uid: "u1", email: "a@b.co", customClaims: { roles: ["Admin", "Member"] } },
      },
    });
    const spied: ProvisionDeps = {
      ...deps,
      setClaims: async (_uid, claims) => {
        claimsWrites.push(claims);
      },
    };
    await provisionMember(spied, "m1", true);
    expect(claimsWrites).toEqual([{ roles: ["Admin", "Member"] }]);
  });
});
