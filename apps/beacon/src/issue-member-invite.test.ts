import { describe, it, expect } from "vitest";
import { HttpsError } from "firebase-functions/v2/https";
import type { Role } from "@luminova/auth/roles";
import { INVITE_PURGE_MS, INVITE_TTL_MS } from "@luminova/types/member-invite";
import {
  validateProvisionInput,
  nextClaims,
  issueInvite,
  type InviteCommit,
  type InviteDeps,
  type ProvisionUser,
} from "./issue-member-invite.js";
import { hashInviteToken } from "./invite-token.js";

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

const NOW = 1_700_000_000_000;

function fakeDeps(opts: {
  member?: Record<string, unknown> | null;
  usersByEmail?: Record<string, ProvisionUser>;
  positions?: Record<string, Role[]>;
  commitThrows?: Error;
}) {
  const calls = {
    createUser: [] as string[],
    setClaims: [] as string[],
    linkUid: [] as string[],
    /** Every commit, in order. ONE port, so the count IS the write-atomicity contract:
     *  there is no way to write the three documents separately. */
    commits: [] as InviteCommit[],
  };
  const users = opts.usersByEmail ?? {};
  const deps: InviteDeps = {
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
    now: () => NOW,
    commitInvite: async (commit) => {
      calls.commits.push(commit);
      if (opts.commitThrows) throw opts.commitThrows;
    },
    getPositionGrants: async (cargoId) => opts.positions?.[cargoId] ?? null,
  };
  return { deps, calls };
}

/** The delegate principal D3 exists for, and the member shape it may act on. */
const DELEGATE = false;
const ADMIN = true;

describe("issueInvite", () => {
  const active = { email: "a@b.co", active: true };
  const TERM = String(new Date().getUTCFullYear());

  it("rejects when the member is already linked to a DIFFERENT live auth user (email changed)", async () => {
    const { deps, calls } = fakeDeps({
      member: { ...active, uid: "old-uid" },
      usersByEmail: { "a@b.co": { uid: "other-uid" }, "old@x.co": { uid: "old-uid" } },
    });
    await expect(issueInvite(deps, "m1", "caller")).rejects.toMatchObject({
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
    await expect(issueInvite(deps, "m1", "caller")).rejects.toMatchObject({
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
    const result = await issueInvite(deps, "m1", "caller", ADMIN);
    expect(result.email).toBe("a@b.co");
    expect(calls.createUser).toEqual([]);
    expect(calls.linkUid).toEqual(["u2"]);
  });

  it("self-heals a stale link by minting a fresh account when the email resolves nothing", async () => {
    // ADMIN caller: a stored uid means this member was provisioned once already, so recovery
    // is an Admin op. A delegate hits the reprovision guard instead (test below).
    const { deps, calls } = fakeDeps({ member: { ...active, uid: "dead-uid" } });
    await issueInvite(deps, "m1", "caller", ADMIN);
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
    const result = await issueInvite(deps, "m1", "caller", ADMIN);
    expect(result.email).toBe("a@b.co");
    expect(result.replacedPreviousLink).toBe(false);
    expect(calls.createUser).toEqual([]);
    expect(calls.setClaims).toEqual(["u1"]);
    expect(calls.linkUid).toEqual(["u1"]);
  });

  it("provisions an unlinked member, creating the auth user when absent", async () => {
    // ADMIN caller: only an Admin receives the action link (see the delegate pair below).
    const { deps, calls } = fakeDeps({ member: active });
    const result = await issueInvite(deps, "m1", "caller", ADMIN);
    expect(result.email).toBe("a@b.co");
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
    await issueInvite(deps, "m1", "caller", ADMIN);
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
    await expect(issueInvite(deps, "m1", "caller", DELEGATE)).rejects.toMatchObject({
      code: "permission-denied",
      details: { reason: "reprovision-requires-admin" },
    });
    // Nothing partial: no claim write, no uid link, no reset link generated.
    expect(calls.setClaims).toEqual([]);
    expect(calls.linkUid).toEqual([]);
    expect(calls.createUser).toEqual([]);
  });

  it("BLOCKING: a delegate may NOT recover a member whose ACCOUNT holds elevated claims", async () => {
    // This case used to be refused by the blanket adoption guard ("already has a login"). D3
    // deliberately opened that branch, so the SAME attack — a create:MemberLogin holder naming
    // the president's memberId to receive a live credential for their account — is now held
    // off by accountIsPrivileged instead. The member doc is clean; only the live Auth account
    // knows it is privileged, which is exactly the gap the doc-reading guards cannot see.
    const { deps, calls } = fakeDeps({
      member: { ...active, uid: "u1" },
      usersByEmail: {
        "a@b.co": { uid: "u1", email: "a@b.co", customClaims: { roles: ["Admin"] } },
      },
    });
    await expect(issueInvite(deps, "m1", "caller", DELEGATE)).rejects.toMatchObject({
      code: "permission-denied",
      details: { reason: "privileged-account-requires-admin" },
    });
    expect(calls.setClaims).toEqual([]);
    expect(calls.linkUid).toEqual([]);
    expect(calls.commits).toEqual([]);
  });

  it("D3: a delegate MAY recover a provisioned, grant-free, unprivileged member", async () => {
    // The decision this feature turns on. Every other guard passes; this is the recovery
    // branch the exhaustive switch opened, and the residual the spec names: the delegate can
    // redeem this token themselves and be that member. Auditable (issuedBy), not prevented.
    const { deps, calls } = fakeDeps({
      member: { ...active, uid: "u1" },
      usersByEmail: {
        "a@b.co": { uid: "u1", email: "a@b.co", customClaims: { roles: ["Member"] } },
      },
    });
    const result = await issueInvite(deps, "m1", "delegate-uid", DELEGATE);
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(calls.createUser).toEqual([]);
    expect(calls.commits[0]?.invite.kind).toBe("recovery");
    expect(calls.commits[0]?.invite.issuedBy).toBe("delegate-uid");
    expect(calls.commits[0]?.invite.issuedByAdmin).toBe(false);
  });

  it("BLOCKING: the SELF-HEAL quadrant stays Admin-only", async () => {
    // The regression a two-branch split would have introduced. The member doc carries a uid
    // but no Auth account resolves (deleted out of band), so it is NEITHER the recovery branch
    // NOR the initial one — and with a two-way split it would fall straight through to
    // createUser -> fresh uid -> linkUid onto the existing member doc, by a delegate. The
    // escalation happens to be closed by the power-seat and direct-grant guards, but that is
    // luck, not design.
    const { deps, calls } = fakeDeps({ member: { ...active, uid: "dead-uid" } });
    await expect(issueInvite(deps, "m1", "caller", DELEGATE)).rejects.toMatchObject({
      code: "permission-denied",
      details: { reason: "reprovision-requires-admin" },
    });
    expect(calls.createUser).toEqual([]);
    expect(calls.linkUid).toEqual([]);
    expect(calls.commits).toEqual([]);
  });

  it("BLOCKING: a delegate may NOT issue for a DISABLED account", async () => {
    // Nothing in beacon disables accounts, so this is a console containment measure. Minting
    // would report success and flip the badge green while the member gets auth/user-disabled
    // at login with no explanation.
    const { deps, calls } = fakeDeps({
      member: { ...active, uid: "u1" },
      usersByEmail: { "a@b.co": { uid: "u1", email: "a@b.co", disabled: true } },
    });
    await expect(issueInvite(deps, "m1", "caller", DELEGATE)).rejects.toMatchObject({
      code: "failed-precondition",
      details: { reason: "account-disabled-requires-admin" },
    });
    expect(calls.commits).toEqual([]);
  });

  it("BLOCKING: an ADMIN may NOT issue for a DISABLED account either", async () => {
    // The disabled check is not a delegation guard, so it does not belong inside the non-Admin
    // block. Minting flips the badge to amber "Pendiente" and hands the operator a link for an
    // account nobody can sign into — the invitee only finds out at redemption, after the
    // credential was sent and the operator was told it worked.
    const { deps, calls } = fakeDeps({
      member: { ...active, uid: "u1" },
      usersByEmail: { "a@b.co": { uid: "u1", email: "a@b.co", disabled: true } },
    });
    await expect(issueInvite(deps, "m1", "caller", ADMIN)).rejects.toMatchObject({
      code: "failed-precondition",
      details: { reason: "account-disabled-requires-admin" },
    });
    expect(calls.commits).toEqual([]);
  });

  it("BLOCKING: refuses an EXPELLED member, who keeps active:true", async () => {
    // setStatus writes only `status`; softDelete writes only `active`. Checking `active` alone
    // let the row menu offer "Invitar acceso" for a Desafiliado member and minted them a fresh
    // 48-hour bearer link.
    const { deps, calls } = fakeDeps({
      member: { ...active, status: "Desafiliado" },
    });
    await expect(issueInvite(deps, "m1", "caller", ADMIN)).rejects.toMatchObject({
      code: "failed-precondition",
      details: { reason: "member-not-active" },
    });
    expect(calls.commits).toEqual([]);
  });

  it("tags the not-found and not-active refusals so the operator gets a real message", async () => {
    // A bare HttpsError carries no details.reason, so provisionRefusalMessage returns null and
    // every retry shows the generic "No se pudo generar el enlace de acceso." with nothing
    // naming the remedy.
    const gone = fakeDeps({ member: null });
    await expect(issueInvite(gone.deps, "m1", "caller", ADMIN)).rejects.toMatchObject({
      code: "not-found",
      details: { reason: "member-not-found" },
    });

    const inactive = fakeDeps({ member: { ...active, active: false } });
    await expect(issueInvite(inactive.deps, "m1", "caller", ADMIN)).rejects.toMatchObject({
      code: "failed-precondition",
      details: { reason: "member-not-active" },
    });
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
    await expect(issueInvite(deps, "m1", "caller", DELEGATE)).rejects.toMatchObject({
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
      await expect(issueInvite(deps, "m1", "caller", DELEGATE)).rejects.toMatchObject({
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
      await expect(issueInvite(deps, "m1", "caller", DELEGATE)).rejects.toMatchObject({
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
      await expect(issueInvite(deps, "m1", "caller", DELEGATE)).resolves.toMatchObject({
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
      await expect(issueInvite(deps, "m1", "caller", DELEGATE)).rejects.toMatchObject({
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
      await expect(issueInvite(deps, "m1", "caller", DELEGATE)).resolves.toMatchObject({
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
    await expect(issueInvite(deps, "m1", "caller", DELEGATE)).rejects.toMatchObject({
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
    await expect(issueInvite(deps, "m1", "caller", DELEGATE)).resolves.toMatchObject({
      email: "a@b.co",
    });
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
    await expect(issueInvite(missing.deps, "m1", "caller-uid", false)).rejects.toMatchObject({
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
    await expect(issueInvite(malformed.deps, "m1", "caller-uid", false)).rejects.toMatchObject({
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
    await expect(issueInvite(deps, "m1", "caller", DELEGATE)).resolves.toMatchObject({
      email: "a@b.co",
    });
    expect(calls.createUser).toEqual(["a@b.co"]);
  });

  it("hands a DELEGATE a real token — there is no withheld second secret any more", async () => {
    // Replaces "a delegate never receives the password-reset link". Before this change beacon
    // minted an oobCode URL and suppressed it for non-Admins, so the guards had a backstop.
    // Now the token IS the credential and is returned to every caller, which means the guards
    // above are the ONLY containment. Stated as a test rather than only as prose, because it
    // is the security posture change D3 rests on.
    //
    // The delegate half also doubles as the paired ALLOW for the BLOCKING cases: the
    // delegation costs nothing on the path it is for, since a genuinely new member has
    // neither an Auth account nor a stored uid — hence the createUser assertion.
    const delegate = fakeDeps({ member: active });
    const asDelegate = await issueInvite(delegate.deps, "m1", "delegate-uid", DELEGATE);
    expect(asDelegate.email).toBe("a@b.co");
    expect(asDelegate.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(delegate.calls.createUser).toEqual(["a@b.co"]);
    expect(delegate.calls.commits[0]?.invite.issuedByAdmin).toBe(false);

    const admin = fakeDeps({ member: active });
    const asAdmin = await issueInvite(admin.deps, "m1", "admin-uid", ADMIN);
    expect(asAdmin.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // issuedByAdmin is what exempts this link from the privilege re-check at redemption.
    expect(admin.calls.commits[0]?.invite.issuedByAdmin).toBe(true);
  });

  it("BLOCKING: a non-Admin caller may NOT provision a member whose uid is set but account is gone", async () => {
    // The self-heal branch: linkedUid points at a deleted account, so getUserByEmail may
    // return null and the adoption half alone would let this through. A stored uid means an
    // Admin already provisioned this member once — recovery is theirs.
    const { deps, calls } = fakeDeps({ member: { ...active, uid: "dead-uid" } });
    await expect(issueInvite(deps, "m1", "caller", DELEGATE)).rejects.toMatchObject({
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
    await expect(issueInvite(deps, "m1", "caller")).rejects.toMatchObject({
      code: "permission-denied",
      details: { reason: "reprovision-requires-admin" },
    });
  });

  it("rejects a missing / inactive / email-less member", async () => {
    await expect(
      issueInvite(fakeDeps({ member: null }).deps, "m1", "caller-uid"),
    ).rejects.toMatchObject({
      code: "not-found",
    });
    await expect(
      issueInvite(
        fakeDeps({ member: { email: "a@b.co", active: false } }).deps,
        "m1",
        "caller-uid",
      ),
    ).rejects.toMatchObject({ code: "failed-precondition" });
    // BLOCKING: an absent or empty email is TAGGED, like every other refusal. It used to throw
    // bare ("member has no email"), so `provisionRefusalMessage` returned null and the operator
    // got the generic "No se pudo…" — the dead end PROVISION_BLOCK_REASONS exists to remove —
    // and it shadowed the tagged malformed-email refusal for the "" case, which is the likelier
    // one (memberDocSchema's `email` is a bare z.string()).
    for (const member of [{ active: true }, { active: true, email: "" }]) {
      await expect(
        issueInvite(fakeDeps({ member }).deps, "m1", "caller-uid"),
      ).rejects.toMatchObject({
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
      "a@b\u0000.bo",
    ]) {
      const { deps, calls } = fakeDeps({ member: { email, active: true } });
      const spied: InviteDeps = {
        ...deps,
        getUserByEmail: async (value) => {
          reached.push(value);
          return deps.getUserByEmail(value);
        },
      };
      await expect(issueInvite(spied, "m1", "caller", ADMIN)).rejects.toMatchObject({
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
    // The screen is the SDK's own predicate plus a whitespace/control-character exclusion —
    // NOT an RFC validator, and the distinction is the whole point of this row. Excluding
    // characters Identity Toolkit rejects anyway costs nothing. Adding RFC STRUCTURE (dot
    // placement, label rules, a TLD requirement) would start refusing addresses Firebase
    // happily creates accounts for, which is the failure the screen exists to prevent pointed
    // the other way — and that failure is now silent-proof from the other side too, since the
    // port tags Identity Toolkit's own rejection rather than letting it surface as `internal`.
    // A plus-tag, a bare hostname and a non-ASCII local part must all keep provisioning.
    for (const email of ["ana+jci@sub.example.co", "root@localhost", "añez@ejemplo.bo"]) {
      const { deps, calls } = fakeDeps({ member: { email, active: true } });
      await expect(issueInvite(deps, "m1", "caller", ADMIN)).resolves.toMatchObject({ email });
      expect(calls.createUser).toEqual([email]);
    }
  });
});

describe("issueInvite — minting, revocation and atomicity", () => {
  const active = { email: "a@b.co", active: true };

  function pendingProjection(tokenHash: string) {
    return { status: "pending", kind: "initial", tokenHash, issuedBy: "someone" };
  }

  it("writes every field the redemption path depends on", async () => {
    const { deps, calls } = fakeDeps({
      member: { ...active, uid: "u1" },
      usersByEmail: { "a@b.co": { uid: "u1", email: "a@b.co" } },
    });
    const result = await issueInvite(deps, "m1", "admin-uid", ADMIN);
    const commit = calls.commits[0];
    expect(commit?.invite).toEqual({
      memberId: "m1",
      // PINNED at issue: what stops a stale link writing a password onto a DIFFERENT account
      // after an out-of-band relink.
      uid: "u1",
      email: "a@b.co",
      kind: "recovery",
      issuedBy: "admin-uid",
      issuedByAdmin: true,
      issuedAtMs: NOW,
      expiresAtMs: NOW + INVITE_TTL_MS,
      purgeAtMs: NOW + INVITE_PURGE_MS,
    });
    // memberId on the invite doc is what keeps a break-glass console sweep POSSIBLE if the
    // projection is ever lost. It is not a designed path, but losing it closes that door.
    expect(commit?.invite.memberId).toBe("m1");
    expect(result.expiresAt).toBe(NOW + INVITE_TTL_MS);
  });

  it("stores the hash of the token it returned, never the token", async () => {
    // If these ever diverge, every minted link is dead on arrival and resolves as
    // `invite-invalid` — indistinguishable from a forged token.
    const { deps, calls } = fakeDeps({ member: active });
    const { token } = await issueInvite(deps, "m1", "admin-uid", ADMIN);
    expect(calls.commits[0]?.tokenHash).toBe(hashInviteToken(token));
    expect(JSON.stringify(calls.commits[0])).not.toContain(token);
  });

  it("revokes the outstanding link BY KEY and reports that it did", async () => {
    const old = "b".repeat(64);
    const { deps, calls } = fakeDeps({
      member: { ...active, uid: "u1", invite: pendingProjection(old) },
      usersByEmail: { "a@b.co": { uid: "u1", email: "a@b.co" } },
    });
    const result = await issueInvite(deps, "m1", "admin-uid", ADMIN);
    expect(result.replacedPreviousLink).toBe(true);
    expect(calls.commits[0]?.revokeTokenHash).toBe(old);
    expect(calls.commits[0]?.revokedBy).toBe("admin-uid");
  });

  it("reports replacedPreviousLink false on a first issue", async () => {
    const { deps } = fakeDeps({ member: active });
    const result = await issueInvite(deps, "m1", "admin-uid", ADMIN);
    expect(result.replacedPreviousLink).toBe(false);
  });

  it.each([
    ["used", { status: "used", tokenHash: "c".repeat(64) }],
    ["revoked", { status: "revoked", tokenHash: "c".repeat(64) }],
    ["failed", { status: "failed", tokenHash: "c".repeat(64) }],
  ])("does not re-revoke an already-spent %s invite", async (_label, invite) => {
    // Rewriting a `used` doc would destroy its usedAt audit trail, and the operator copy
    // ("el anterior fue revocado") would be a lie.
    const { deps, calls } = fakeDeps({
      member: { ...active, uid: "u1", invite },
      usersByEmail: { "a@b.co": { uid: "u1", email: "a@b.co" } },
    });
    const result = await issueInvite(deps, "m1", "admin-uid", ADMIN);
    expect(result.replacedPreviousLink).toBe(false);
    expect(calls.commits[0]?.revokeTokenHash).toBeNull();
  });

  it.each([
    ["a malformed projection", "not-an-object"],
    ["an array projection", ["x"]],
    ["an unusable tokenHash", { status: "pending", tokenHash: "../../etc" }],
    ["a missing tokenHash", { status: "pending" }],
  ])(
    "still mints when the projection is unusable (%s), never a forged doc path",
    async (_l, invite) => {
      const { deps, calls } = fakeDeps({
        member: { ...active, uid: "u1", invite },
        usersByEmail: { "a@b.co": { uid: "u1", email: "a@b.co" } },
      });
      const result = await issueInvite(deps, "m1", "admin-uid", ADMIN);
      expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(calls.commits[0]?.revokeTokenHash).toBeNull();
    },
  );

  it("commits revoke + mint + project through ONE port, exactly once", async () => {
    // The C2 guarantee, and the reason it is structural rather than asserted: InviteDeps
    // offers NO way to write the three documents separately, so there is no ordering for a
    // partial failure to interleave with. A partial failure would leave a live `pending`
    // token the operator already sent with the projection pointing at the old hash — and
    // nothing could ever revoke it. This asserts the shape that makes that unrepresentable.
    const { deps, calls } = fakeDeps({
      member: { ...active, uid: "u1", invite: pendingProjection("d".repeat(64)) },
      usersByEmail: { "a@b.co": { uid: "u1", email: "a@b.co" } },
    });
    await issueInvite(deps, "m1", "admin-uid", ADMIN);
    expect(calls.commits).toHaveLength(1);
    const commit = calls.commits[0];
    expect(commit?.revokeTokenHash).toBe("d".repeat(64));
    expect(commit?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(commit?.memberId).toBe("m1");
  });

  it.each([
    // ADOPTION: an account already exists, the member doc is unlinked. The person may already
    // have a password, so this is a recovery — not a first issue.
    ["adoption", { ...active }, { "a@b.co": { uid: "u9", email: "a@b.co" } }, "recovery"],
    // SELF-HEAL: a uid is stored but the account was deleted, so a BRAND-NEW account is minted
    // with no password. That is a first issue, whatever the stored uid says.
    ["self-heal", { ...active, uid: "dead-uid" }, {}, "initial"],
  ])(
    "labels %s correctly — kind follows the LOGIN, not the stored uid",
    async (_l, member, users, kind) => {
      const { deps, calls } = fakeDeps({ member, usersByEmail: users as never });
      await issueInvite(deps, "m1", "admin-uid", ADMIN);
      expect(calls.commits[0]?.invite.kind).toBe(kind);
    },
  );

  it("does not claim to have revoked an ALREADY-EXPIRED prior link", async () => {
    // An expired link needs no revoking, and saying "el anterior fue revocado" about one that
    // died days ago is a lie to the operator. It also keeps the common re-issue off a document
    // the purgeAt TTL policy may already have reaped.
    const { deps, calls } = fakeDeps({
      member: {
        ...active,
        uid: "u1",
        invite: {
          status: "pending",
          tokenHash: "e".repeat(64),
          expiresAt: { toMillis: () => NOW - 1 },
        },
      },
      usersByEmail: { "a@b.co": { uid: "u1", email: "a@b.co" } },
    });
    const result = await issueInvite(deps, "m1", "admin-uid", ADMIN);
    expect(result.replacedPreviousLink).toBe(false);
    expect(calls.commits[0]?.revokeTokenHash).toBeNull();
  });

  it("DOES revoke a prior link that is still live", async () => {
    const { deps, calls } = fakeDeps({
      member: {
        ...active,
        uid: "u1",
        invite: {
          status: "pending",
          tokenHash: "f".repeat(64),
          expiresAt: { toMillis: () => NOW + 1000 },
        },
      },
      usersByEmail: { "a@b.co": { uid: "u1", email: "a@b.co" } },
    });
    const result = await issueInvite(deps, "m1", "admin-uid", ADMIN);
    expect(result.replacedPreviousLink).toBe(true);
    expect(calls.commits[0]?.revokeTokenHash).toBe("f".repeat(64));
  });

  it("surfaces a commit failure instead of returning a token nothing stored", async () => {
    // The caller must not receive a link the operator would then send for a document that was
    // never written.
    const boom = new Error("batch failed");
    const { deps } = fakeDeps({ member: active, commitThrows: boom });
    await expect(issueInvite(deps, "m1", "admin-uid", ADMIN)).rejects.toThrow("batch failed");
  });

  it("never lets the token reach a log line", async () => {
    const seen: unknown[] = [];
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) => {
      const original = console[level];
      console[level] = (...args: unknown[]) => void seen.push(...args);
      return () => {
        console[level] = original;
      };
    });
    try {
      const { deps } = fakeDeps({
        member: { ...active, uid: "u1", invite: "malformed" },
        usersByEmail: { "a@b.co": { uid: "u1", email: "a@b.co" } },
      });
      const { token } = await issueInvite(deps, "m1", "admin-uid", ADMIN);
      const dumped = seen.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
      expect(dumped).not.toContain(token);
      // and the malformed projection still produced a diagnostic (guardrail #4)
      expect(dumped).toContain("malformed");
    } finally {
      for (const restore of spies) restore();
    }
  });
});

// Every case here exercises the ADOPTION path, which is Admin-only — hence the explicit
// `true` third argument throughout. A non-Admin caller is refused before any of this runs
// (see "a non-Admin caller may NOT adopt a pre-existing unlinked account").
describe("issueInvite — stale-claims bootstrap (fresh adopt)", () => {
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
    const spied: InviteDeps = {
      ...deps,
      setClaims: async (_uid, claims) => {
        claimsWrites.push(claims);
      },
    };
    await issueInvite(spied, "m1", "caller", ADMIN);
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
    const spied: InviteDeps = {
      ...deps,
      setClaims: async (_uid, claims) => {
        claimsWrites.push(claims);
      },
    };
    await issueInvite(spied, "m1", "caller", ADMIN);
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
    const spied: InviteDeps = {
      ...deps,
      setClaims: async (_uid, claims) => {
        claimsWrites.push(claims);
      },
    };
    await issueInvite(spied, "m1", "caller", ADMIN);
    expect(claimsWrites).toEqual([{ roles: ["Admin", "Member"] }]);
  });
});
