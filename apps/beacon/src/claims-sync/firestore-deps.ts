import type { Auth, UserRecord } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { isValidRole, type Role } from "@luminova/auth/roles";
import { isValidPermissionCode, type PermissionCode } from "@luminova/types/permission";
import { chunk } from "../chunk.js";
import { isSafeDocId } from "../firestore-util.js";
import { isActiveRoleDoc, permsFromRoleDoc } from "./role-doc.js";
import type { LiveBuiltInRoleDoc } from "./resolve-member-perms.js";
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

/** The built-in role docs covering `keys`, plus a log line for every coverage anomaly the
 *  `builtIn` conjunct below can otherwise hide. COVERAGE is the load-bearing property: an
 *  uncovered key falls through to BUILT_IN_ROLE_PERMS[key] in resolveMemberPerms, so a doc
 *  dropped here silently RESTORES the seed snapshot — turning a deactivation into a no-op
 *  that /permisos still reports as a revocation. None of these shapes is client-authorable
 *  (rules forbid writing builtIn/builtInKey), so each one means a console edit or a partial
 *  migration: log it, but keep resolving (throwing would strand every member's claims). */
async function queryBuiltInRoleDocs(db: Firestore, keys: Role[]): Promise<LiveBuiltInRoleDoc[]> {
  // `in` supports ≤30 values; ROLES has 9. `builtIn === true` is defense in
  // depth against an impostor custom role spoofing a builtInKey (rules also
  // forbid clients setting builtInKey, but the trust boundary is the trigger).
  // NO liveness filter: a deactivated doc must still reach resolveMemberPerms so it
  // COVERS its key. Filtering here made a deactivated built-in indistinguishable
  // from an unseeded one, which restored its seed perms.
  //
  // DO NOT ADD `.limit()`. The repo's "bound every query" guardrail does not apply: the
  // `in` operator already bounds this read to ≤30 matched values by construction (ROLES
  // has 9). A limit here would be actively harmful — a truncated page DROPS a doc, which
  // un-COVERS its key, which re-mints BUILT_IN_ROLE_PERMS[key] through the fallback in
  // resolveMemberPerms. That is a privilege restoration disguised as a boundedness fix,
  // and it would be silent except for the anomaly logs below (which cannot see it, since
  // a truncated doc never arrives at all).
  const snap = await db.collection("roles").where("builtInKey", "in", keys).get();

  const dropped = snap.docs.filter((d) => d.get("builtIn") !== true);
  if (dropped.length > 0) {
    console.error(
      "claims-sync: role doc matched a builtInKey but is not builtIn:true — dropped, so its key falls back to the seed perms",
      { keys, droppedIds: dropped.map((d) => d.id) },
    );
  }

  const covering = snap.docs.filter((d) => d.get("builtIn") === true);
  const idsByKey = new Map<string, string[]>();
  for (const doc of covering) {
    const key = doc.get("builtInKey") as string;
    idsByKey.set(key, [...(idsByKey.get(key) ?? []), doc.id]);
  }
  for (const [key, ids] of idsByKey) {
    if (ids.length > 1) {
      console.error(
        "claims-sync: more than one role doc claims one builtInKey — beacon unions their perms while the /permisos preview shows last-wins",
        { builtInKey: key, ids },
      );
    } else if (ids[0] !== key) {
      console.error(
        "claims-sync: role doc covers a builtInKey from a different doc id — reseedBuiltInRolePerms reads it as not-built-in and will never update it",
        { builtInKey: key, id: ids[0] },
      );
    }
  }

  return covering.map((d) => ({
    permissions: permsFromRoleDoc(d.data()),
    builtInKey: d.get("builtInKey") as Role,
    live: isActiveRoleDoc(d.data()),
  }));
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

  // Memoized per deps instance, exactly like userCache above. onRoleWritten's fan-out
  // calls this once per member, sequentially, for a set of ≤9 docs that cannot change
  // within a single invocation — the repeat query is pure latency on the code path that
  // actually times out. Keyed on the sorted key SET so call-order variation still hits.
  // Rejections are evicted (not memoized) so one transient error does not fail every
  // remaining member of the fan-out.
  const builtInDocsCache = new Map<string, Promise<LiveBuiltInRoleDoc[]>>();
  function loadBuiltInRoleDocs(keys: Role[]): Promise<LiveBuiltInRoleDoc[]> {
    const cacheKey = [...new Set(keys)].sort().join(",");
    let pending = builtInDocsCache.get(cacheKey);
    if (!pending) {
      pending = queryBuiltInRoleDocs(db, keys).catch((error) => {
        builtInDocsCache.delete(cacheKey);
        throw error;
      });
      builtInDocsCache.set(cacheKey, pending);
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
      return loadBuiltInRoleDocs(keys);
    },
    getRolesByIds: async (ids) => {
      if (ids.length === 0) return [];
      // Screen the ids BEFORE the `roles/${id}` path template: rules cap neither the
      // shape nor the size of roleIds, and an empty or "/"-bearing entry makes db.doc()
      // throw — which fails this member's claims sync permanently, not transiently.
      // Mirrors currentCargoId (same helper). Fails closed: a screened id grants nothing.
      const usable = ids.filter((id) => isSafeDocId(id));
      if (usable.length !== ids.length) {
        console.error(
          "claims-sync: roleIds entries cannot be a doc id — ignored, granting no perms",
          {
            roleIds: ids.filter((id) => !isSafeDocId(id)),
          },
        );
      }
      // roleIds is Admin-writable but rules impose no size cap, so bound the
      // getAll fan-out in 300-ref batches (mirrors resolveMembers) rather than
      // splatting an unbounded ref list into a single getAll call.
      const refs = usable.map((id) => db.doc(`roles/${id}`));
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
