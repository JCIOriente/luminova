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

/** Max rejected `roleIds` entries named in one log line, and the per-entry char cap.
 *  `roleIds` is Admin-writable with no size or length cap in rules, so serializing every
 *  rejected entry lets one junk-filled member doc exceed Cloud Logging's 256 KB per-entry
 *  limit — the entry is then DROPPED, making the anomaly invisible at exactly the scale
 *  that matters. The count is the alertable signal; the sample is for diagnosis. */
const REJECTED_ID_SAMPLE = 10;
const REJECTED_ID_MAX_CHARS = 64;

function sampleRejectedIds(rejected: readonly string[]): string[] {
  return rejected
    .slice(0, REJECTED_ID_SAMPLE)
    .map((id) =>
      id.length > REJECTED_ID_MAX_CHARS ? `${id.slice(0, REJECTED_ID_MAX_CHARS)}…` : id,
    );
}

/** The built-in role docs covering `keys`, plus a log line for every coverage anomaly the
 *  `builtIn` conjunct below can otherwise hide. COVERAGE is the load-bearing property: an
 *  uncovered key falls through to BUILT_IN_ROLE_PERMS[key] in resolveMemberPerms, so a doc
 *  dropped here silently RESTORES the seed snapshot — turning a deactivation into a no-op
 *  that /permisos still reports as a revocation. None of these shapes is client-authorable
 *  (rules forbid writing builtIn/builtInKey), so each one means a console edit or a partial
 *  migration: log it, but keep resolving (throwing would strand every member's claims).
 *
 *  `log: false` suppresses the anomaly lines for the staleness re-check below, which re-runs
 *  this query purely to compare snapshots — re-logging every anomaly there would double
 *  every line and imply the condition had appeared twice. */
async function queryBuiltInRoleDocs(
  db: Firestore,
  keys: Role[],
  { log = true }: { log?: boolean } = {},
): Promise<LiveBuiltInRoleDoc[]> {
  // `in` supports ≤30 values; ROLES has 9. `builtIn === true` is defense in
  // depth against an impostor custom role spoofing a builtInKey (rules also
  // forbid clients setting builtInKey, but the trust boundary is the trigger).
  // NO liveness filter: a deactivated doc must still reach resolveMemberPerms so it
  // COVERS its key. Filtering here made a deactivated built-in indistinguishable
  // from an unseeded one, which restored its seed perms.
  //
  // DO NOT ADD `.limit()`. A limit here would be actively harmful — a truncated page DROPS
  // a doc, which un-COVERS its key, which re-mints BUILT_IN_ROLE_PERMS[key] through the
  // fallback in resolveMemberPerms. That is a privilege restoration disguised as a
  // boundedness fix, and it would be silent even to the anomaly logs below, since a
  // truncated doc never arrives at all.
  //
  // The real bound is CURATION, not the operator: `in` caps the number of distinct FILTER
  // VALUES at 30, NOT the result-set size — any number of docs may carry
  // `builtInKey: 'Member'`, which is exactly the duplicate-key condition logged below. What
  // bounds this read is that `builtIn` and `builtInKey` are not client-writable (rules forbid
  // it), so `roles` is admin-curated at roughly 9-20 docs. Recorded as a deliberate
  // exception in docs/engineering-guardrails.md beside RoleRepository.getAll().
  const snap = await db.collection("roles").where("builtInKey", "in", keys).get();

  const covering = snap.docs.filter((d) => d.get("builtIn") === true);
  const coveredKeys = new Set(covering.map((d) => d.get("builtInKey") as string));

  const dropped = snap.docs.filter((d) => d.get("builtIn") !== true);
  if (log && dropped.length > 0) {
    // "MAY fall back": the drop only un-COVERS the key when no OTHER builtIn:true doc
    // claims it. With a second, well-formed doc on the same key the fallback never fires
    // and the perms come from that doc — same log line, materially different outcome, so
    // the message must not assert the seed snapshot is what gets minted.
    console.error(
      "claims-sync: role doc matched a builtInKey but is not builtIn:true — dropped, so its key MAY fall back to the seed perms (it does not if another builtIn:true doc covers the same key)",
      {
        keys,
        droppedIds: dropped.map((d) => d.id),
        stillCoveredKeys: dropped
          .map((d) => d.get("builtInKey") as string)
          .filter((key) => coveredKeys.has(key)),
      },
    );
  }

  const idsByKey = new Map<string, string[]>();
  for (const doc of covering) {
    const key = doc.get("builtInKey") as string;
    idsByKey.set(key, [...(idsByKey.get(key) ?? []), doc.id]);
  }
  if (log) {
    for (const [key, ids] of idsByKey) {
      if (ids.length > 1) {
        console.error(
          "claims-sync: more than one role doc claims one builtInKey — their live perms are unioned, so a deactivation of one doc does not revoke what the other still grants",
          { builtInKey: key, ids },
        );
      }
      // INDEPENDENT `if`, not an `else if`: a key with two docs where one is also off-id used
      // to log only the duplicate line, hiding the frozen-perms condition — the one the spec
      // calls a permanent silent freeze the reseed still reports as ok:true. Both can hold.
      // reseedBuiltInRolePerms iterates ROLES and reads `roles/{key}` BY ID, so it never
      // updates an off-id doc. The old message said it "reads it as not-built-in and will
      // never update it", which is only one of the sub-cases — the SIGNAL an operator sees
      // differs, so spell out both halves rather than asserting the narrow one.
      for (const id of ids.filter((docId) => docId !== key)) {
        const selfRow = isValidRole(id)
          ? `roles/${id} read and skipped not-built-in`
          : `roles/${id} never read (its own id is not a ROLES key)`;
        const keyRow = ids.includes(key)
          ? `roles/${key} exists and is reseeded independently`
          : `roles/${key} reported missing + failed, so ok:false`;
        console.error(
          "claims-sync: role doc covers a builtInKey from a different doc id — reseedBuiltInRolePerms keys on the doc id, so THIS doc's permissions are never updated",
          { builtInKey: key, id, reseedSignal: `${selfRow}; ${keyRow}` },
        );
      }
    }
  }

  // Frozen, array AND docs AND each permissions array: the memo below hands this exact
  // object graph to every member of the fan-out, so an in-place mutation anywhere
  // downstream (a future `doc.permissions.sort()`) would corrupt every remaining member's
  // claims — one write, N wrong results, no log. Freezing makes that throw in strict mode
  // instead. resolveEffectivePerms only reads, so nothing needs the mutability today.
  return Object.freeze(
    covering.map((d) =>
      Object.freeze({
        permissions: Object.freeze(permsFromRoleDoc(d.data())) as PermissionCode[],
        builtInKey: d.get("builtInKey") as Role,
        live: isActiveRoleDoc(d.data()),
      }),
    ),
  ) as LiveBuiltInRoleDoc[];
}

/** Order-insensitive canonical form of a built-in query result, for the staleness compare.
 *  Serializes each doc independently and sorts the STRINGS, so it is a total order even
 *  with two docs claiming one builtInKey (sorting on builtInKey alone is not). */
function canonicalBuiltInDocs(docs: readonly LiveBuiltInRoleDoc[]): string {
  return docs
    .map((d) =>
      JSON.stringify({ key: d.builtInKey, live: d.live, perms: [...d.permissions].sort() }),
    )
    .sort()
    .join("|");
}

async function getUserOrNull(auth: Auth, uid: string): Promise<UserRecord | null> {
  try {
    return await auth.getUser(uid);
  } catch (error) {
    if ((error as { code?: string }).code === "auth/user-not-found") return null;
    throw error;
  }
}

/** What `firestoreClaimsDeps` actually returns: the port, plus the staleness probe that
 *  makes the memo's one unsafe assumption observable. Separate from `ClaimsSyncDeps` because
 *  the probe is a property of THIS implementation's caching, not of the claims-sync contract —
 *  the in-memory fakes the unit tests drive `syncMemberClaims` with have no memo to check. */
export interface FirestoreClaimsDeps extends ClaimsSyncDeps {
  /** Re-read every built-in role key this instance memoized and report the keys whose
   *  on-disk state no longer matches what the fan-out was served. Empty means every
   *  member in this invocation saw current role state. Costs ONE query. */
  staleBuiltInRoleKeys(): Promise<Role[]>;
}

export function firestoreClaimsDeps(db: Firestore, auth: Auth): FirestoreClaimsDeps {
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

  // Memoized per deps instance, exactly like userCache above. onRoleWritten's fan-out calls
  // this once per member, sequentially, over a set of ≤9 docs — the repeat query is pure
  // latency on the code path that actually times out. Keyed on the sorted key SET so
  // call-order variation still hits. Rejections are evicted (not memoized) so one transient
  // error does not fail every remaining member of the fan-out.
  //
  // THE MEMO IS NOT SAFE ON ITS OWN, and an earlier version of this comment claimed it was
  // ("≤9 docs that cannot change within a single invocation" — false). onRoleWritten and
  // recomputeAllClaims each hold ONE deps instance for up to 540 s, and a role doc can be
  // written at any point inside that window:
  //   t=0    Admin deactivates roles/Treasury; fan-out A starts, memo warms with
  //          Membership.live === true
  //   t=60   Admin deactivates roles/Membership; fan-out B correctly writes member M
  //          without Membership's perms
  //   t=90   fan-out A reaches M and, from its STALE snapshot, writes M's claims back WITH
  //          Membership's perms
  // With retry:false there is no redelivery and no later trigger, so M keeps a deactivated
  // role's perms indefinitely. Before the memo this self-healed, because every member's read
  // was fresh — the memo opened a stale-liveness window in exactly the direction the role
  // lifecycle work exists to close.
  //
  // The memo is kept (the timeout it prevents is the more likely failure) and the divergence
  // is made OBSERVABLE instead: staleBuiltInRoleKeys() below re-reads once after the fan-out
  // and the caller logs the operator's cue to run recomputeAllClaims. Deliberately NOT a TTL:
  // a TTL would narrow the window while keeping the failure silent, which is strictly worse
  // than a wide window an operator is told about.
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
    staleBuiltInRoleKeys: async () => {
      const memoized = [...builtInDocsCache.entries()];
      if (memoized.length === 0) return [];
      // ONE query over the UNION of every memoized key set, however many sets were cached.
      // `where builtInKey in keys` means filtering the union by key membership reproduces
      // exactly what a per-set query would have returned, so one read covers them all.
      const union = [
        ...new Set(memoized.flatMap(([cacheKey]) => cacheKey.split(",").filter((k) => k.length))),
      ].filter((k): k is Role => isValidRole(k));
      if (union.length === 0) return [];
      const fresh = await queryBuiltInRoleDocs(db, union, { log: false });
      // Compared PER KEY, not per cached set: every set containing a key returns the same
      // docs for it (same `in` semantics), so a per-key compare names exactly the roles that
      // moved instead of implicating every key that shared a cache entry with one of them.
      const servedByKey = new Map<Role, LiveBuiltInRoleDoc[]>();
      for (const [cacheKey, pending] of memoized) {
        // A rejection already evicted itself; anything still unsettled cannot be compared.
        const served = await pending.catch(() => null);
        if (!served) continue;
        for (const key of cacheKey.split(",")) {
          if (!isValidRole(key) || servedByKey.has(key)) continue;
          servedByKey.set(
            key,
            served.filter((d) => d.builtInKey === key),
          );
        }
      }
      const stale: Role[] = [];
      for (const [key, served] of servedByKey) {
        const freshForKey = fresh.filter((d) => d.builtInKey === key);
        if (canonicalBuiltInDocs(served) !== canonicalBuiltInDocs(freshForKey)) stale.push(key);
      }
      return stale.sort();
    },
    getPosition: async (id) => {
      // Belt-and-braces: resolveTrustedGrants in sync.ts already screens cargoId (that is
      // the port-independent gate the test fakes inherit), but this is the site where an
      // unscreened id becomes a permanent db.doc() throw, so it does not rely on its caller.
      if (!isSafeDocId(id)) return null;
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
      // ONE partition pass: the two filters evaluated isSafeDocId (and its TextEncoder) twice
      // per id on the error path, inside a per-member fan-out.
      const usable: string[] = [];
      const rejected: string[] = [];
      for (const id of ids) {
        if (isSafeDocId(id)) usable.push(id);
        else rejected.push(id);
      }
      if (rejected.length > 0) {
        // Count first, bounded sample second — see REJECTED_ID_SAMPLE. Serializing all of
        // them let one member doc push the entry past Cloud Logging's per-entry limit, which
        // drops the entry entirely: the anomaly went invisible precisely when it was largest.
        console.error(
          "claims-sync: roleIds entries cannot be a doc id — ignored, granting no perms",
          {
            rejectedCount: rejected.length,
            totalCount: ids.length,
            rejectedSample: sampleRejectedIds(rejected),
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
