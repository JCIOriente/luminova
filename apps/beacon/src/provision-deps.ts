import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { isValidRole, type Role } from "@luminova/auth/roles";
import { isSafeDocId } from "./firestore-util.js";
import type { ProvisionDeps } from "./provision-member-login.js";

// Null only for the "account does not exist" outcome — a transient Auth error
// must propagate, not read as deleted (the relink guard trusts that contract).
function nullIfUserNotFound(err: unknown): null {
  if ((err as { code?: unknown } | null)?.code === "auth/user-not-found") return null;
  throw err;
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
    // auth/email-already-exists).
    createUser: (email) => auth.createUser({ email }).catch(() => auth.getUserByEmail(email)),
    setClaims: (uid, claims) => auth.setCustomUserClaims(uid, claims),
    linkUid: async (id, uid) => {
      await db.doc(`members/${id}`).update({ uid });
    },
    passwordResetLink: (email) => auth.generatePasswordResetLink(email),
    getPositionGrants: async (cargoId) => {
      if (!isSafeDocId(cargoId)) return null;
      const snap = await db.doc(`positions/${cargoId}`).get();
      if (!snap.exists) return null;
      const grants = (snap.data()?.grants ?? []) as unknown[];
      return grants.filter((g): g is Role => isValidRole(g));
    },
  };
}
