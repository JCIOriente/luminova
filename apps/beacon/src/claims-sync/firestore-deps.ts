import type { Auth, UserRecord } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { isValidRole, type Role } from "@luminova/auth/roles";
import type { ClaimsSyncDeps } from "./sync.js";

function rolesFromClaims(claims: Record<string, unknown> | undefined): Role[] {
  const raw = claims?.roles;
  return Array.isArray(raw) ? raw.filter((r): r is Role => isValidRole(r)) : [];
}

async function getUserOrNull(auth: Auth, uid: string): Promise<UserRecord | null> {
  try {
    return await auth.getUser(uid);
  } catch (error) {
    if ((error as { code?: string }).code === "auth/user-not-found") return null;
    throw error;
  }
}

export function firestoreClaimsDeps(db: Firestore, auth: Auth): ClaimsSyncDeps {
  const userCache = new Map<string, Promise<UserRecord | null>>();
  function loadUser(uid: string): Promise<UserRecord | null> {
    let pending = userCache.get(uid);
    if (!pending) {
      pending = getUserOrNull(auth, uid).catch((error) => {
        userCache.delete(uid);
        throw error;
      });
      userCache.set(uid, pending);
    }
    return pending;
  }

  return {
    getPosition: async (id) => {
      const snap = await db.doc(`positions/${id}`).get();
      if (!snap.exists) return null;
      const grants = (snap.data()?.grants ?? []) as unknown[];
      return { grants: grants.filter((g): g is Role => isValidRole(g)) };
    },
    getUserRoles: async (uid) => {
      const user = await loadUser(uid);
      return user ? rolesFromClaims(user.customClaims as Record<string, unknown> | undefined) : [];
    },
    getExistingClaims: async (uid) => {
      const user = await loadUser(uid);
      const claims = user?.customClaims as Record<string, unknown> | undefined;
      const scannerEventIds = Array.isArray(claims?.scannerEventIds)
        ? (claims.scannerEventIds as unknown[]).filter((s): s is string => typeof s === "string")
        : undefined;
      return scannerEventIds
        ? { roles: rolesFromClaims(claims), scannerEventIds }
        : { roles: rolesFromClaims(claims) };
    },
    setClaims: async (uid, next) => {
      await auth.setCustomUserClaims(uid, next);
    },
  };
}
