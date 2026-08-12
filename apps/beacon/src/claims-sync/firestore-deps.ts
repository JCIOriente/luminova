import type { Auth, UserRecord } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { isValidRole, type Role } from "@luminova/auth/roles";
import { isValidPermissionCode, type PermissionCode } from "@luminova/types/permission";
import { chunk } from "../chunk.js";
import { isActiveRoleDoc, permsFromRoleDoc } from "./role-doc.js";
import type { ClaimsSyncDeps } from "./sync.js";

function rolesFromClaims(claims: Record<string, unknown> | undefined): Role[] {
  const raw = claims?.roles;
  return Array.isArray(raw) ? raw.filter((r): r is Role => isValidRole(r)) : [];
}

function permsFromClaims(
  claims: Record<string, unknown> | undefined,
): PermissionCode[] | undefined {
  const raw = claims?.perms;
  return Array.isArray(raw)
    ? raw.filter((p): p is PermissionCode => isValidPermissionCode(p))
    : undefined;
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
      const roles = rolesFromClaims(claims);
      const perms = permsFromClaims(claims);
      return { roles, ...(perms ? { perms } : {}) };
    },
    getRoleDocsByBuiltInKeys: async (keys) => {
      if (keys.length === 0) return [];
      // `in` supports ≤30 values; ROLES has 9. `builtIn === true` is defense in
      // depth against an impostor custom role spoofing a builtInKey (rules also
      // forbid clients setting builtInKey, but the trust boundary is the trigger).
      const snap = await db.collection("roles").where("builtInKey", "in", keys).get();
      return snap.docs
        .filter((d) => d.get("builtIn") === true && isActiveRoleDoc(d.data()))
        .map((d) => ({
          permissions: permsFromRoleDoc(d.data()),
          builtInKey: d.get("builtInKey") as Role,
        }));
    },
    getRolesByIds: async (ids) => {
      if (ids.length === 0) return [];
      // roleIds is Admin-writable but rules impose no size cap, so bound the
      // getAll fan-out in 300-ref batches (mirrors resolveMembers) rather than
      // splatting an unbounded ref list into a single getAll call.
      const refs = ids.map((id) => db.doc(`roles/${id}`));
      const out: { permissions: PermissionCode[] }[] = [];
      for (const batch of chunk(refs, 300)) {
        const snaps = await db.getAll(...batch);
        out.push(
          ...snaps
            .filter((s) => s.exists && isActiveRoleDoc(s.data()))
            .map((s) => ({ permissions: permsFromRoleDoc(s.data()) })),
        );
      }
      return out;
    },
    setClaims: async (uid, next) => {
      await auth.setCustomUserClaims(uid, next);
    },
    logError: (message, meta) => console.error(message, meta),
  };
}
