import { describe, expect, it } from "vitest";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { firestoreInviteDeps } from "./provision-deps.js";

/** Nothing under test reads Firestore — `createUser` is a pure Auth path. */
const db = {} as Firestore;

/** An Auth stub narrow enough to drive `createUser`'s one call chain. The cast is test-only
 *  and justified: `UserRecord` carries a dozen fields (metadata, providerData, toJSON) that
 *  nothing here reads, and fabricating them would assert nothing. A missing email throws the
 *  real `auth/user-not-found`, which is what the live SDK does. */
function fakeAuth(opts: {
  createError?: unknown;
  byEmailError?: unknown;
  byUidError?: unknown;
  byEmail?: Record<string, { uid: string }>;
  byUid?: Record<string, { uid: string }>;
}) {
  const calls = {
    createUser: [] as string[],
    getUserByEmail: [] as string[],
    getUser: [] as string[],
  };
  const auth = {
    createUser: async ({ email }: { email: string }) => {
      calls.createUser.push(email);
      if (opts.createError !== undefined) throw opts.createError;
      return { uid: `new-${email}`, email };
    },
    getUserByEmail: async (email: string) => {
      calls.getUserByEmail.push(email);
      if (opts.byEmailError !== undefined) throw opts.byEmailError;
      const user = opts.byEmail?.[email];
      if (!user) throw Object.assign(new Error("no user"), { code: "auth/user-not-found" });
      return user;
    },
    getUser: async (uid: string) => {
      calls.getUser.push(uid);
      if (opts.byUidError !== undefined) throw opts.byUidError;
      const user = opts.byUid?.[uid];
      if (!user) throw Object.assign(new Error("no user"), { code: "auth/user-not-found" });
      return user;
    },
  } as unknown as Auth;
  return { auth, calls };
}

// The contract `nullIfUserNotFound` exists to hold, stated in the ProvisionDeps docblock and
// until now pinned by NOTHING: "null ONLY when the account does not exist — transient Auth
// errors must throw, or a blip would misread a live linked account as safely deleted".
//
// getUserByUid is the one the relink guard calls, and it had no coverage at all here;
// provision-member-login.test.ts drives hand-written fakes that bypass this port entirely. The
// mutation that was invisible: widen the null branch to `code === "auth/user-not-found" ||
// code === "auth/internal-error"` and the whole beacon suite stays green, while an Identity
// Toolkit blip during the relink guard reads a LIVE linked account as safely deleted and lets
// the caller re-provision over it.
describe("firestoreInviteDeps — the null-vs-throw contract", () => {
  const lookups = ["getUserByEmail", "getUserByUid"] as const;

  it("returns null for user-not-found, on both lookups", async () => {
    for (const method of lookups) {
      const { auth } = fakeAuth({});
      await expect(firestoreInviteDeps(db, auth)[method]("a@b.co")).resolves.toBeNull();
    }
  });

  it("BLOCKING: a transient Auth error throws — it must never read as a deleted account", async () => {
    for (const method of lookups) {
      for (const err of [
        authError("auth/internal-error"),
        authError("auth/network-request-failed"),
        new Error("socket hang up"),
      ]) {
        const { auth } = fakeAuth(
          method === "getUserByEmail" ? { byEmailError: err } : { byUidError: err },
        );
        await expect(firestoreInviteDeps(db, auth)[method]("a@b.co")).rejects.toThrow();
      }
    }
  });
});

const authError = (code: string) => Object.assign(new Error(code), { code });

describe("firestoreInviteDeps.createUser", () => {
  it("returns the freshly minted account without consulting getUserByEmail", async () => {
    const { auth, calls } = fakeAuth({});
    await expect(firestoreInviteDeps(db, auth).createUser("a@b.co")).resolves.toMatchObject({
      uid: "new-a@b.co",
    });
    expect(calls.createUser).toEqual(["a@b.co"]);
    expect(calls.getUserByEmail).toEqual([]);
  });

  it("BLOCKING: rethrows a non-collision Auth error instead of masking it as a lookup", async () => {
    // The catch used to be blanket. A quota, disabled-provider or invalid-email failure then
    // fell through to getUserByEmail — which throws auth/user-not-found for an email no
    // account was ever created for, and nullIfUserNotFound turns THAT into a null the relink
    // guard reads as "the account was safely deleted". Wrong outcome, and the real cause was
    // gone from the log. The fallback must fire for exactly one code.
    for (const code of ["auth/quota-exceeded", "auth/operation-not-allowed"]) {
      const { auth, calls } = fakeAuth({ createError: authError(code) });
      await expect(firestoreInviteDeps(db, auth).createUser("a@b.co")).rejects.toMatchObject({
        code,
      });
      expect(calls.getUserByEmail).toEqual([]);
    }
  });

  // auth/invalid-email is the one non-collision code that does NOT stay raw. The shape screen
  // in provisionMember is a pre-filter, not a guarantee: "a@.", ".a@b.co" and "a..b@c.co" each
  // carry one @, no whitespace and no control characters, so they pass it AND the Admin SDK's
  // own isEmail, and only Identity Toolkit rejects them. Rethrown raw that reaches the operator
  // as an opaque `internal` with no details.reason — the generic "No se pudo…" dead end — on a
  // member who is then unprovisionable with no hint. Tagged at the port closes the class
  // however the regex evolves.
  it("BLOCKING: tags an Identity-Toolkit invalid-email as the reason the UI can name", async () => {
    for (const method of ["createUser", "getUserByEmail"] as const) {
      const { auth } = fakeAuth(
        method === "createUser"
          ? { createError: authError("auth/invalid-email") }
          : { byEmailError: authError("auth/invalid-email") },
      );
      await expect(firestoreInviteDeps(db, auth)[method]("a@.")).rejects.toMatchObject({
        code: "failed-precondition",
        details: { reason: "member-email-malformed" },
      });
    }
  });

  it("rethrows a codeless throw too — an unrecognized shape is not a collision", async () => {
    const { auth, calls } = fakeAuth({ createError: new Error("socket hang up") });
    await expect(firestoreInviteDeps(db, auth).createUser("a@b.co")).rejects.toThrow(
      "socket hang up",
    );
    expect(calls.getUserByEmail).toEqual([]);
  });

  it("falls back to getUserByEmail ONLY on a concurrent-create collision", async () => {
    // The one tolerated case: a parallel invite already minted the account, so adopting it is
    // the correct resolution rather than a failure.
    const { auth, calls } = fakeAuth({
      createError: authError("auth/email-already-exists"),
      byEmail: { "a@b.co": { uid: "u-existing" } },
    });
    await expect(firestoreInviteDeps(db, auth).createUser("a@b.co")).resolves.toMatchObject({
      uid: "u-existing",
    });
    expect(calls.createUser).toEqual(["a@b.co"]);
    expect(calls.getUserByEmail).toEqual(["a@b.co"]);
  });

  it("propagates the lookup's own failure when the collision resolves to nothing", async () => {
    // Not squashed to null: the caller's null contract means "no account exists", and this
    // path just proved one does.
    const { auth } = fakeAuth({ createError: authError("auth/email-already-exists") });
    await expect(firestoreInviteDeps(db, auth).createUser("a@b.co")).rejects.toMatchObject({
      code: "auth/user-not-found",
    });
  });
});

// The C2 guarantee, at the layer that actually implements it. issue-member-invite.test.ts can
// only prove the CALLER uses one port; this proves the port uses one BATCH. Without it, an
// edit splitting commitInviteBatch into three awaited writes passes every other test in the
// repo while reintroducing the orphaned-live-token failure the whole design is built around.
describe("firestoreInviteDeps — commitInvite is one atomic batch", () => {
  function fakeDb() {
    const writes: { op: string; path: string; data: unknown; merge?: boolean }[] = [];
    const commits: number[] = [];
    const batches: unknown[] = [];
    const db = {
      doc: (path: string) => ({ path }),
      batch: () => {
        const batch = {
          set: (ref: { path: string }, data: unknown, opts?: { merge?: boolean }) =>
            writes.push({ op: "set", path: ref.path, data, merge: opts?.merge === true }),
          update: (ref: { path: string }, data: unknown) =>
            writes.push({ op: "update", path: ref.path, data }),
          commit: async () => void commits.push(writes.length),
        };
        batches.push(batch);
        return batch;
      },
    } as unknown as Firestore;
    return { db, writes, commits, batches };
  }

  const invite = {
    memberId: "m1",
    uid: "u1",
    email: "ana@jci.bo",
    kind: "recovery" as const,
    issuedBy: "admin-uid",
    issuedByAdmin: true,
    issuedAtMs: 1_700_000_000_000,
    expiresAtMs: 1_700_000_000_000 + 1000,
    purgeAtMs: 1_700_000_000_000 + 2000,
  };

  it("revokes, mints and projects in a SINGLE batch with ONE commit", async () => {
    const { db, writes, commits, batches } = fakeDb();
    const { auth } = fakeAuth({});
    await firestoreInviteDeps(db, auth).commitInvite({
      memberId: "m1",
      revokeTokenHash: "b".repeat(64),
      revokedBy: "admin-uid",
      tokenHash: "a".repeat(64),
      invite,
    });
    expect(batches).toHaveLength(1);
    expect(commits).toEqual([3]);
    expect(writes.map((w) => `${w.op} ${w.path}`)).toEqual([
      // `set` + merge, not `update` — see the purged-invite case below.
      `set memberInvites/${"b".repeat(64)}`,
      `set memberInvites/${"a".repeat(64)}`,
      "update members/m1",
    ]);
  });

  // BLOCKING (H1): batch.update() REJECTS THE WHOLE BATCH if the target is missing. The
  // projection keeps `status: "pending"` forever on a link nobody redeemed — "expired" is
  // derived client-side and nothing writes a terminal status — while the invite DOCUMENT is
  // reaped at issuedAt+90d by the purgeAt TTL policy. From day 91 every re-issue for that
  // member fails identically and opaquely, with no retry that can clear it, and that includes
  // the locked-out-Admin recovery path which is now the ONLY in-product remedy.
  it("BLOCKING: revoking a PURGED invite must not fail the batch", async () => {
    const { db, writes, commits } = fakeDb();
    const { auth } = fakeAuth({});
    await firestoreInviteDeps(db, auth).commitInvite({
      memberId: "m1",
      revokeTokenHash: "b".repeat(64),
      revokedBy: "admin-uid",
      tokenHash: "a".repeat(64),
      invite,
    });
    const revoke = writes[0];
    // `set` with merge, not `update`: a resurrected stub fails parseInvite (no memberId/uid/
    // kind) and reads as the generic invite-invalid, and it carries purgeAt so it is reaped
    // again rather than lingering forever.
    expect(revoke?.op).toBe("set");
    expect((revoke?.data as Record<string, unknown>).purgeAt).toBeDefined();
    expect(revoke?.merge).toBe(true);
    expect(commits).toEqual([3]);
  });

  it("omits only the revoke write on a first issue, still one commit", async () => {
    const { db, writes, commits, batches } = fakeDb();
    const { auth } = fakeAuth({});
    await firestoreInviteDeps(db, auth).commitInvite({
      memberId: "m1",
      revokeTokenHash: null,
      revokedBy: "admin-uid",
      tokenHash: "a".repeat(64),
      invite,
    });
    expect(batches).toHaveLength(1);
    expect(commits).toEqual([2]);
    expect(writes.map((w) => w.op)).toEqual(["set", "update"]);
  });

  it("projects exactly the fields clients read, and never the token", async () => {
    const { db, writes } = fakeDb();
    const { auth } = fakeAuth({});
    await firestoreInviteDeps(db, auth).commitInvite({
      memberId: "m1",
      revokeTokenHash: null,
      revokedBy: "admin-uid",
      tokenHash: "a".repeat(64),
      invite,
    });
    const projection = (writes.at(-1)?.data as { invite: Record<string, unknown> }).invite;
    expect(Object.keys(projection).sort()).toEqual(
      ["expiresAt", "issuedAt", "issuedBy", "kind", "status", "tokenHash", "usedAt"].sort(),
    );
    // issuedByAdmin is deliberately NOT projected: it is an authorization detail for the
    // redemption re-check, and members/{id} is readable by the whole chapter.
    expect(projection.issuedByAdmin).toBeUndefined();
    expect(projection.status).toBe("pending");
  });
});
