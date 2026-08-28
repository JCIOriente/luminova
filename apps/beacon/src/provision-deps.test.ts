import { describe, expect, it } from "vitest";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { firestoreProvisionDeps } from "./provision-deps.js";

/** Nothing under test reads Firestore — `createUser` is a pure Auth path. */
const db = {} as Firestore;

/** An Auth stub narrow enough to drive `createUser`'s one call chain. The cast is test-only
 *  and justified: `UserRecord` carries a dozen fields (metadata, providerData, toJSON) that
 *  nothing here reads, and fabricating them would assert nothing. A missing email throws the
 *  real `auth/user-not-found`, which is what the live SDK does. */
function fakeAuth(opts: {
  createError?: unknown;
  byEmailError?: unknown;
  byEmail?: Record<string, { uid: string }>;
}) {
  const calls = { createUser: [] as string[], getUserByEmail: [] as string[] };
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
  } as unknown as Auth;
  return { auth, calls };
}

const authError = (code: string) => Object.assign(new Error(code), { code });

describe("firestoreProvisionDeps.createUser", () => {
  it("returns the freshly minted account without consulting getUserByEmail", async () => {
    const { auth, calls } = fakeAuth({});
    await expect(firestoreProvisionDeps(db, auth).createUser("a@b.co")).resolves.toMatchObject({
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
      await expect(firestoreProvisionDeps(db, auth).createUser("a@b.co")).rejects.toMatchObject({
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
      await expect(firestoreProvisionDeps(db, auth)[method]("a@.")).rejects.toMatchObject({
        code: "failed-precondition",
        details: { reason: "member-email-malformed" },
      });
    }
  });

  it("rethrows a codeless throw too — an unrecognized shape is not a collision", async () => {
    const { auth, calls } = fakeAuth({ createError: new Error("socket hang up") });
    await expect(firestoreProvisionDeps(db, auth).createUser("a@b.co")).rejects.toThrow(
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
    await expect(firestoreProvisionDeps(db, auth).createUser("a@b.co")).resolves.toMatchObject({
      uid: "u-existing",
    });
    expect(calls.createUser).toEqual(["a@b.co"]);
    expect(calls.getUserByEmail).toEqual(["a@b.co"]);
  });

  it("propagates the lookup's own failure when the collision resolves to nothing", async () => {
    // Not squashed to null: the caller's null contract means "no account exists", and this
    // path just proved one does.
    const { auth } = fakeAuth({ createError: authError("auth/email-already-exists") });
    await expect(firestoreProvisionDeps(db, auth).createUser("a@b.co")).rejects.toMatchObject({
      code: "auth/user-not-found",
    });
  });
});
