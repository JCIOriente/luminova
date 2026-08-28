import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { readPositionGrants } from "./read-position-grants.js";
import { logError } from "./firestore-util.js";
import { memberEmailMalformed, type ProvisionDeps } from "./provision-member-login.js";

function authCode(err: unknown): unknown {
  return (err as { code?: unknown } | null)?.code;
}

/** Identity Toolkit rejects addresses the SHAPE screen cannot: `a@.`, `.a@b.co`, `a..b@c.co`
 *  each carry one `@`, no whitespace and no control characters, so they pass
 *  `ADMIN_SDK_EMAIL_SHAPE` and the Admin SDK's own isEmail alike and only fail server-side.
 *  Rethrown raw, that is an opaque `internal` with no `details.reason` and a member nobody can
 *  provision without knowing why. Tagged HERE rather than by chasing regex precision: this
 *  closes the class whatever the pattern does next. */
function tagInvalidEmail(err: unknown): never {
  if (authCode(err) === "auth/invalid-email") throw memberEmailMalformed();
  throw err;
}

// Null only for the "account does not exist" outcome — a transient Auth error
// must propagate, not read as deleted (the relink guard trusts that contract).
function nullIfUserNotFound(err: unknown): null {
  if (authCode(err) === "auth/user-not-found") return null;
  return tagInvalidEmail(err);
}

export function firestoreProvisionDeps(db: Firestore, auth: Auth): ProvisionDeps {
  return {
    getMember: async (id) => {
      const snap = await db.doc(`members/${id}`).get();
      return snap.exists ? (snap.data() as Record<string, unknown>) : null;
    },
    getUserByEmail: (email) => auth.getUserByEmail(email).catch(nullIfUserNotFound),
    getUserByUid: (uid) => auth.getUser(uid).catch(nullIfUserNotFound),
    // Tolerate a concurrent create (a parallel invite would otherwise throw
    // auth/email-already-exists) — and ONLY that. A blanket catch also swallowed quota,
    // disabled-provider and invalid-email errors and re-surfaced them as an unrelated
    // auth/user-not-found, destroying the diagnostic.
    createUser: (email) =>
      auth.createUser({ email }).catch((err: unknown) => {
        if (authCode(err) !== "auth/email-already-exists") return tagInvalidEmail(err);
        return auth.getUserByEmail(email);
      }),
    setClaims: (uid, claims) => auth.setCustomUserClaims(uid, claims),
    linkUid: async (id, uid) => {
      await db.doc(`members/${id}`).update({ uid });
    },
    passwordResetLink: (email) => auth.generatePasswordResetLink(email),
    getPositionGrants: (cargoId) => readPositionGrants(db, cargoId, logError),
  };
}
