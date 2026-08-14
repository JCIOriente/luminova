import { BUILT_IN_ROLE_PERMS } from "@luminova/types/role-definition";
import type { PermissionCode, Role, RoleDefinition } from "@luminova/types";
import { resolveEffectivePerms } from "./perms.js";

/** A built-in role doc as the shared resolution consumes it.
 *
 *  Deliberately NOT a `Pick` of the stored doc shape. Liveness is the TWO-field predicate
 *  over `active` AND `deletedAt`, so a port field named `active` would read as "the doc's
 *  `active` field" and an implementer returning `d.get("active")` would satisfy the type
 *  while readmitting the ghost shape (`active: true` with a non-null `deletedAt`) that
 *  mints the doc's real perms. Naming the semantic keeps the contract unspoofable by a
 *  plain field read.
 *
 *  Liveness *derivation* stays per-side (beacon's `isActiveRoleDoc` reads `DocumentData`
 *  from `firebase-admin/firestore`, which this package — consumed by the browser bundle
 *  and the rules test suite — must not import). Only *consumption* is shared. */
export interface BuiltInRoleDoc {
  readonly permissions: readonly PermissionCode[];
  readonly builtInKey: Role;
  /** Precomputed liveness. NEVER the raw `active` field: a doc with `active: true` and a
   *  non-null `deletedAt` is a ghost — covered, contributing nothing. */
  readonly live: boolean;
}

/** The one three-way built-in resolution, shared by beacon's claims-sync
 *  (`resolveMemberPerms`) and the backstage member-assignment preview
 *  (`previewEffectivePerms`). Synchronous and pure over already-fetched docs — it does not
 *  sort or mutate its inputs, because beacon hands it a deep-frozen graph.
 *
 *  Three-way per built-in key:
 *    - NO doc claims the key   → BUILT_IN_ROLE_PERMS[key] (the pre-seed window must still
 *                                mint perms on a fresh project)
 *    - doc(s) claim it, live   → the UNION of their stored `permissions`
 *    - doc(s) claim it, none live → nothing, and the key stays COVERED (so the snapshot
 *                                must NOT come back). That distinction is the entire
 *                                reason not-live docs have to be passed in: drop them at
 *                                the port and a deactivation silently restores the seed.
 *
 *  Grouped per key, not mapped: two docs may claim one `builtInKey`. A Map would keep only
 *  the last, making the answer depend on the order the docs happened to arrive in.
 *
 *  A doc whose `builtInKey` is not in `builtInRoleNames` is IGNORED — it neither
 *  contributes perms nor covers a key. In production beacon queries
 *  `where("builtInKey","in",keys)` so it cannot be handed one, but the function is total
 *  and picks the tighter reading rather than leaving it to the caller's query.
 *
 *  `PERMISSION_CAP` is deliberately NOT applied: the callers disagree on the response
 *  (beacon fail-closes to `perms: []`, backstage blocks Save), so the cap stays theirs. */
export function resolveBuiltInPerms(input: {
  builtInRoleNames: readonly Role[];
  builtInDocs: readonly BuiltInRoleDoc[];
  customDocs: readonly Pick<RoleDefinition, "permissions">[];
  overrides?: { grant: PermissionCode[]; revoke: PermissionCode[] };
}): PermissionCode[] {
  const requested = new Set(input.builtInRoleNames);
  const claiming = input.builtInDocs.filter((doc) => requested.has(doc.builtInKey));
  const covered = new Set(claiming.map((doc) => doc.builtInKey));
  const roleDocs: Pick<RoleDefinition, "permissions">[] = [];
  for (const doc of claiming) {
    if (doc.live) roleDocs.push({ permissions: [...doc.permissions] });
  }
  for (const name of requested) {
    if (!covered.has(name)) roleDocs.push({ permissions: [...BUILT_IN_ROLE_PERMS[name]] });
  }
  for (const doc of input.customDocs) roleDocs.push({ permissions: [...doc.permissions] });
  return resolveEffectivePerms({ roleDocs, overrides: input.overrides });
}
