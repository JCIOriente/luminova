import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { readPositionGrants } from "./read-position-grants.js";
import { logError } from "./firestore-util.js";
import { memberEmailMalformed } from "./provision-errors.js";
import type { ProvisionDeps } from "./provision-member-login.js";

function authCode(err: unknown): unknown {
  return (err as { code?: unknown } | null)?.code;
}

/** Identity Toolkit rejects addresses the SHAPE screen cannot: `a@.`, `.a@b.co`, `a..b@c.co`
 *  each carry one `@`, no whitespace and no control characters, so they pass
 *  `ADMIN_SDK_EMAIL_SHAPE` and the Admin SDK's own isEmail alike and only fail server-side.
 *  Rethrown raw, that is an opaque `internal` with no `details.reason` and a member nobody can
 *  provision without knowing why. Tagged HERE rather than by chasing regex precision: this
 *  closes the class whatever the pattern does next.
 *
 *  Residual, deliberately not chased further: a rejection that maps to `auth/invalid-argument`
 *  rather than `auth/invalid-email` still reaches the client opaque. The shape screen plus this
 *  tag cover the reachable cases. */
function tagInvalidEmail(err: unknown): never {
  if (authCode(err) === "auth/invalid-email") {
    // The HttpsError replaces the original, and firebase-functions treats a thrown HttpsError
    // as an EXPECTED refusal — no "Unhandled error" line. Without this the failure class would
    // leave zero trace in Cloud Logging (guardrail #4). Code only, never the address: PII.
    logError("provision refused: Auth rejected the stored email", { code: authCode(err) });
    throw memberEmailMalformed();
  }
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
    // Deliberately NOT routed through tagInvalidEmail: this is the only Auth call that runs
    // AFTER createUser and linkUid, so tagging it would tell the operator to "corrige el correo"
    // about an account that already exists and is already linked.
    passwordResetLink: (email) => auth.generatePasswordResetLink(email),
    getPositionGrants: (cargoId) => readPositionGrants(db, cargoId, logError),
  };
}
