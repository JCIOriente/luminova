import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import type { ProvisionDeps } from "./provision-member-login.js";

export function firestoreProvisionDeps(db: Firestore, auth: Auth): ProvisionDeps {
  return {
    getMember: async (id) => {
      const snap = await db.doc(`members/${id}`).get();
      return snap.exists ? (snap.data() as Record<string, unknown>) : null;
    },
    getUserByEmail: (email) => auth.getUserByEmail(email).catch(() => null),
    // Tolerate a concurrent create (a parallel invite would otherwise throw
    // auth/email-already-exists).
    createUser: (email) => auth.createUser({ email }).catch(() => auth.getUserByEmail(email)),
    setClaims: (uid, claims) => auth.setCustomUserClaims(uid, claims),
    linkUid: async (id, uid) => {
      await db.doc(`members/${id}`).update({ uid });
    },
    passwordResetLink: (email) => auth.generatePasswordResetLink(email),
  };
}
