import { describe, it, expect } from "vitest";
import { HttpsError } from "firebase-functions/v2/https";
import type { Role } from "@luminova/auth/roles";
import {
  validateProvisionInput,
  nextClaims,
  provisionMember,
  type ProvisionDeps,
  type ProvisionUser,
} from "./provision-member-login.js";

describe("validateProvisionInput", () => {
  function codeOf(data: unknown): string {
    try {
      validateProvisionInput(data);
      return "no-throw";
    } catch (err) {
      return err instanceof HttpsError ? err.code : "not-an-https-error";
    }
  }

  it("accepts a clean memberId", () => {
    expect(validateProvisionInput({ memberId: "m-1" })).toEqual({ memberId: "m-1" });
  });

  it("rejects every unusable memberId with invalid-argument, never a 500", () => {
    // The CODE, not merely a throw: `.`, `..` and `__x__` BUILD a valid ref and fail LATER at
    // get() with a permanent INVALID_ARGUMENT, which reaches the caller as `internal` — a 500
    // for what is a malformed request. A non-string had no typeof check at all before. Those
    // are exactly the shapes moving to isSafeDocId added; the empty and "/"-bearing rows were
    // already caught by the hand-rolled check this replaced, and stay as the regression floor.
    const unusable: unknown[] = [
      undefined,
      "",
      "a/b",
      ".",
      "..",
      "__name__",
      42,
      { id: "m-1" },
      "x".repeat(1501),
    ];
    for (const memberId of unusable) {
      expect(codeOf({ memberId })).toBe("invalid-argument");
    }
    expect(codeOf({})).toBe("invalid-argument");
    expect(codeOf(null)).toBe("invalid-argument");
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
  positions?: Record<string, Role[]>;
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
    getPositionGrants: async (cargoId) => opts.positions?.[cargoId] ?? null,
  };
  return { deps, calls };
}

describe("provisionMember", () => {
  const active = { email: "a@b.co", active: true };
  const TERM = String(new Date().getUTCFullYear());

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
    // ADMIN caller: only an Admin receives the action link (see the delegate pair below).
    const { deps, calls } = fakeDeps({ member: active });
    const result = await provisionMember(deps, "m1", true);
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
      details: { reason: "reprovision-requires-admin" },
    });
    // Nothing partial: no claim write, no uid link, no reset link generated.
    expect(calls.setClaims).toEqual([]);
    expect(calls.linkUid).toEqual([]);
    expect(calls.createUser).toEqual([]);
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
      details: { reason: "reprovision-requires-admin" },
    });
    expect(calls.setClaims).toEqual([]);
    expect(calls.linkUid).toEqual([]);
  });

  it("BLOCKING: a non-Admin caller may NOT provision a POWER-SEATED member", async () => {
    // The escalation this closes, and the delegate forges nothing to get it: any uid-less
    // member is reachable — including one an Admin already seated on an Admin-granting cargo,
    // which is the normal state between being seated and being invited. linkUid() fires
    // onMemberWritten, resolveTrustedGrants reads the STORED assignedBy (a genuine Admin),
    // honors the grants, and mints Admin onto the uid this call just created. The attacker
    // then reaches that uid through the invite mail — which lands in THEIR inbox if they also
    // hold manage:Member and rewrote members.email first, since the rules never pin it.
    const { deps, calls } = fakeDeps({
      member: {
        ...active,
        positions: { [TERM]: { cargoId: "pos-pres", comisionIds: [], assignedBy: "admin-uid" } },
      },
      positions: { "pos-pres": ["Admin"] },
    });
    await expect(provisionMember(deps, "m1", false)).rejects.toMatchObject({
      code: "permission-denied",
      details: { reason: "power-seat-requires-admin" },
    });
    expect(calls.createUser).toEqual([]);
    expect(calls.linkUid).toEqual([]);
  });

  it("BLOCKING: a non-Admin caller may NOT provision a member carrying DIRECT grants", async () => {
    // The other half of the claims-mint surface. syncMemberClaims mints `roles` from trusted
    // cargo grants AND `perms` from roleIds + permissionOverrides — the second path needs no
    // cargo at all, and "granted but not yet invited" is exactly what the Admin-only roles
    // panel produces. Without this, a manage:Member + create:MemberLogin holder rewrites such
    // a member's email (the rules never pin it), provisions them, and the account they now
    // control is minted that member's whole granted perm set — which may itself include
    // update:BoardSeat, chaining into the seating lane.
    const granted: Record<string, unknown>[] = [
      { roleIds: ["custom-role"] },
      { permissionOverrides: { grant: ["update:BoardSeat"], revoke: [] } },
    ];
    for (const fields of granted) {
      const { deps, calls } = fakeDeps({ member: { ...active, ...fields } });
      await expect(provisionMember(deps, "m1", false)).rejects.toMatchObject({
        code: "permission-denied",
        details: { reason: "granted-member-requires-admin" },
      });
      expect(calls.createUser).toEqual([]);
      expect(calls.linkUid).toEqual([]);
    }
  });

  it("fails closed on a PRESENT but malformed grants shape", async () => {
    const malformed: Record<string, unknown>[] = [
      { roleIds: "custom-role" },
      { roleIds: {} },
      { permissionOverrides: "nope" },
      { permissionOverrides: { grant: "update:BoardSeat" } },
      { permissionOverrides: ["manage:all"] },
    ];
    for (const fields of malformed) {
      const { deps } = fakeDeps({ member: { ...active, ...fields } });
      await expect(provisionMember(deps, "m1", false)).rejects.toMatchObject({
        code: "permission-denied",
        details: { reason: "granted-member-requires-admin" },
      });
    }
  });

  it("treats empty / absent / explicitly-null grants as ungranted", async () => {
    // The paired ALLOW. The rules' unchanged()/touched() gap admits an explicit null, and
    // parseMember resolves that to [] — so null must read as "no grants", not as malformed,
    // or ordinary members become un-invitable by a delegate.
    const ungranted: Record<string, unknown>[] = [
      {},
      { roleIds: [] },
      { roleIds: null },
      { permissionOverrides: null },
      { permissionOverrides: { grant: [], revoke: [] } },
      { permissionOverrides: { revoke: ["read:Member"] } },
      { roleIds: [], permissionOverrides: { grant: [], revoke: [] } },
    ];
    for (const fields of ungranted) {
      const { deps } = fakeDeps({ member: { ...active, ...fields } });
      await expect(provisionMember(deps, "m1", false)).resolves.toMatchObject({
        email: "a@b.co",
      });
    }
  });

  it("fails closed on a PRESENT but malformed positions shape", async () => {
    // The guard's own bypass if these read as "no cargo". None is produced by a client write
    // path — assignedBySelf() errors on a non-object term and the rules deny — but a console
    // edit or a partial migration reaches them, and the whole point of the guard is that an
    // unreadable cargo is not an absent one.
    const shapes: Record<string, unknown>[] = [
      { positions: "not-an-object" },
      { positions: { [TERM]: "not-an-object" } },
      { positions: { [TERM]: { cargoId: 42, comisionIds: [] } } },
      { positions: { [TERM]: { cargoId: "", comisionIds: [] } } },
    ];
    for (const positions of shapes) {
      const { deps, calls } = fakeDeps({ member: { ...active, ...positions } });
      await expect(provisionMember(deps, "m1", false)).rejects.toMatchObject({
        code: "permission-denied",
        details: { reason: "power-seat-requires-admin" },
      });
      expect(calls.createUser).toEqual([]);
    }
  });

  it("treats a genuinely ABSENT cargo as unseated, not as malformed", async () => {
    // The paired ALLOW. Without it the fail-closed test above would pass for a guard that
    // simply refused every non-Admin provision, which is the whole delegation.
    const shapes: Record<string, unknown>[] = [
      {},
      { positions: {} },
      { positions: { [TERM]: { comisionIds: [] } } },
      { positions: { [TERM]: { cargoId: null, comisionIds: [] } } },
      { positions: { "1999": { cargoId: "pos-unknown-but-grantfree", comisionIds: [] } } },
    ];
    for (const positions of shapes) {
      const { deps } = fakeDeps({
        member: { ...active, ...positions },
        positions: { "pos-unknown-but-grantfree": [] },
      });
      await expect(provisionMember(deps, "m1", false)).resolves.toMatchObject({
        email: "a@b.co",
      });
    }
  });

  it("BLOCKING: a FUTURE-term power cargo is refused too, not just the current term", async () => {
    // syncMemberClaims reads positions[currentTermKey()] at TRIGGER time, so a next-term entry
    // is invisible today and mints on the UTC-year rollover — a genuine Admin in assignedBy,
    // the cargo's grants honored, onto an account a delegate caused to exist. Every client
    // lane is term-pinned so the shape needs a console edit or a migration, which is the same
    // reachability this file already fail-closes on for a malformed cargoId.
    const { deps, calls } = fakeDeps({
      member: {
        ...active,
        positions: { "2099": { cargoId: "pos-pres", comisionIds: [], assignedBy: "admin-uid" } },
      },
      positions: { "pos-pres": ["Admin"] },
    });
    await expect(provisionMember(deps, "m1", false)).rejects.toMatchObject({
      code: "permission-denied",
      details: { reason: "power-seat-requires-admin" },
    });
    expect(calls.createUser).toEqual([]);
  });

  it("still allows a delegate when EVERY term's cargo is grant-free", async () => {
    const { deps, calls } = fakeDeps({
      member: {
        ...active,
        positions: {
          [TERM]: { cargoId: "pos-dir", comisionIds: [], assignedBy: "delegate-uid" },
          "2099": { cargoId: "pos-dir2", comisionIds: [], assignedBy: "delegate-uid" },
        },
      },
      positions: { "pos-dir": [], "pos-dir2": [] },
    });
    await expect(provisionMember(deps, "m1", false)).resolves.toMatchObject({ email: "a@b.co" });
    expect(calls.createUser).toEqual(["a@b.co"]);
  });

  it("fails closed when the seated cargo cannot be read", async () => {
    // A missing or malformed cargo must not read as "no cargo" — that would be the guard's
    // own bypass.
    const missing = fakeDeps({
      member: {
        ...active,
        positions: { [TERM]: { cargoId: "pos-ghost", comisionIds: [], assignedBy: "admin-uid" } },
      },
    });
    await expect(provisionMember(missing.deps, "m1", false)).rejects.toMatchObject({
      code: "permission-denied",
      details: { reason: "power-seat-requires-admin" },
    });
    // The malformed half pins readCargoIds' `isSafeDocId(cargoId) ? cargoId : ""` mapping,
    // which is why the fake ANSWERS "a/b" with a grant-free cargo: without that seed both
    // halves would resolve through `opts.positions?.[…] ?? null` alike, and turning the
    // mapping into a passthrough would leave this green. Seeded, a passthrough would read the
    // grant-free entry and ALLOW.
    const malformed = fakeDeps({
      member: {
        ...active,
        positions: { [TERM]: { cargoId: "a/b", comisionIds: [], assignedBy: "admin-uid" } },
      },
      positions: { "a/b": [] },
    });
    await expect(provisionMember(malformed.deps, "m1", false)).rejects.toMatchObject({
      code: "permission-denied",
      details: { reason: "power-seat-requires-admin" },
    });
  });

  it("still lets a delegate provision a member seated on a GRANT-FREE cargo", async () => {
    // Seating plus inviting on a grant-free cargo mints nothing, and is exactly the enrolment
    // flow the delegation exists for. Without this pair the guard above would pass for a rule
    // that simply refused every seated member.
    //
    // NOT subsumed by the delegate half of "never receives the password-reset link", which is
    // the claim this test was once deleted on. That fixture is `member: active` — no
    // `positions` map at all — so `readCargoIds` yields nothing and the guard's loop body
    // never executes. Only this test drives the loop to a resolved cargo and out the ALLOW
    // side; a guard rewritten to refuse whenever ANY cargoId is present leaves the rest of
    // this file green.
    const { deps, calls } = fakeDeps({
      member: {
        ...active,
        positions: { [TERM]: { cargoId: "pos-dir", comisionIds: [], assignedBy: "delegate-uid" } },
      },
      positions: { "pos-dir": [] },
    });
    await expect(provisionMember(deps, "m1", false)).resolves.toMatchObject({ email: "a@b.co" });
    expect(calls.createUser).toEqual(["a@b.co"]);
  });

  it("BLOCKING: a delegate never receives the password-reset link", async () => {
    // generatePasswordResetLink returns a bearer credential for the account. The client sends
    // the reset mail itself through the unprivileged sendPasswordResetEmail, so a delegate has
    // no need to hold it. Defence in depth behind the power-seat guard, not a substitute.
    //
    // The delegate half doubles as the paired ALLOW for every BLOCKING case above: the
    // delegation costs nothing on the path it is actually for, since a genuinely new member
    // has neither an Auth account nor a stored uid — hence the createUser assertion.
    const delegate = fakeDeps({ member: active });
    await expect(provisionMember(delegate.deps, "m1", false)).resolves.toEqual({
      email: "a@b.co",
      actionLink: "",
    });
    expect(delegate.calls.createUser).toEqual(["a@b.co"]);
    const admin = fakeDeps({ member: active });
    await expect(provisionMember(admin.deps, "m1", true)).resolves.toEqual({
      email: "a@b.co",
      actionLink: "link:a@b.co",
    });
  });

  it("BLOCKING: a non-Admin caller may NOT provision a member whose uid is set but account is gone", async () => {
    // The self-heal branch: linkedUid points at a deleted account, so getUserByEmail may
    // return null and the adoption half alone would let this through. A stored uid means an
    // Admin already provisioned this member once — recovery is theirs.
    const { deps, calls } = fakeDeps({ member: { ...active, uid: "dead-uid" } });
    await expect(provisionMember(deps, "m1", false)).rejects.toMatchObject({
      code: "permission-denied",
      details: { reason: "reprovision-requires-admin" },
    });
    expect(calls.createUser).toEqual([]);
  });

  it("defaults callerIsAdmin to false — a new call site must opt into adoption", async () => {
    // The parameter defaults closed so an added caller that forgets it gets the SAFE path.
    const { deps } = fakeDeps({
      member: active,
      usersByEmail: { "a@b.co": { uid: "u9", email: "a@b.co" } },
    });
    await expect(provisionMember(deps, "m1")).rejects.toMatchObject({
      code: "permission-denied",
      details: { reason: "reprovision-requires-admin" },
    });
  });

  it("rejects a missing / inactive / email-less member", async () => {
    await expect(provisionMember(fakeDeps({ member: null }).deps, "m1")).rejects.toMatchObject({
      code: "not-found",
    });
    await expect(
      provisionMember(fakeDeps({ member: { email: "a@b.co", active: false } }).deps, "m1"),
    ).rejects.toMatchObject({ code: "failed-precondition" });
    // BLOCKING: an absent or empty email is TAGGED, like every other refusal. It used to throw
    // bare ("member has no email"), so `provisionRefusalMessage` returned null and the operator
    // got the generic "No se pudo…" — the dead end PROVISION_BLOCK_REASONS exists to remove —
    // and it shadowed the tagged malformed-email refusal for the "" case, which is the likelier
    // one (memberDocSchema's `email` is a bare z.string()).
    for (const member of [{ active: true }, { active: true, email: "" }]) {
      await expect(provisionMember(fakeDeps({ member }).deps, "m1")).rejects.toMatchObject({
        code: "failed-precondition",
        details: { reason: "member-email-malformed" },
      });
    }
  });

  it("BLOCKING: screens a malformed stored email instead of surfacing an opaque `internal`", async () => {
    // `email` reaches auth.getUserByEmail / auth.createUser, which reject anything outside the
    // Admin SDK's shape with a PERMANENT auth/invalid-email. nullIfUserNotFound only swallows
    // auth/user-not-found, so it rethrows and the operator sees `internal` — with no hint that
    // the fix is editing the member's stored email. firestore.rules does not shape-validate
    // email on the admin write lane, so this shape is reachable.
    const reached: string[] = [];
    // The last four are the tightening over the SDK's own `/^[^@]+@[^@]+$/`: `[^@]` matches
    // whitespace and control characters, so each of these passes that pattern AND the SDK's
    // client-side check, reaches Identity Toolkit, and returns INVALID_EMAIL as an opaque
    // `internal` — the exact failure this screen exists to prevent, one layer further out.
    for (const email of [
      "not-an-email",
      "@b.co",
      "a@",
      "a@b@c.co",
      "  ",
      "pres@jci.bo\n",
      "a b@jci.bo",
      "a@b\t.bo",
      "a@b .bo",
    ]) {
      const { deps, calls } = fakeDeps({ member: { email, active: true } });
      const spied: ProvisionDeps = {
        ...deps,
        getUserByEmail: async (value) => {
          reached.push(value);
          return deps.getUserByEmail(value);
        },
      };
      await expect(provisionMember(spied, "m1", true)).rejects.toMatchObject({
        code: "failed-precondition",
        details: { reason: "member-email-malformed" },
      });
      // Screened before the SDK sees it — that is the whole point of the check.
      expect(reached).toEqual([]);
      expect(calls.createUser).toEqual([]);
      expect(calls.linkUid).toEqual([]);
    }
  });

  it("does NOT refuse the unusual addresses the Admin SDK accepts", async () => {
    // The screen is the SDK's own predicate (`/^[^@]+@[^@]+$/`), not an RFC validator: a
    // plus-tag, a bare hostname and a non-ASCII local part all provision as before. Tightening
    // this regex would make members with legitimate addresses unprovisionable — the exact
    // failure the screen exists to prevent, pointed the other way.
    for (const email of ["ana+jci@sub.example.co", "root@localhost", "añez@ejemplo.bo"]) {
      const { deps, calls } = fakeDeps({ member: { email, active: true } });
      await expect(provisionMember(deps, "m1", true)).resolves.toEqual({
        email,
        actionLink: `link:${email}`,
      });
      expect(calls.createUser).toEqual([email]);
    }
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
