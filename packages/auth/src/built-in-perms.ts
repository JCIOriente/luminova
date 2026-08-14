import { BUILT_IN_ROLE_PERMS } from "@luminova/types/role-definition";
import type { PermissionCode, Role, RoleDefinition } from "@luminova/types";
import { resolveEffectivePerms } from "./perms.js";

/** Anything `resolveEffectivePerms` can union perms out of — a live built-in doc, a custom
 *  doc, or the seed snapshot. Structural, so no branch has to be widened by hand. */
type PermsSource = { readonly permissions: readonly PermissionCode[] };

/** A built-in role doc as the shared resolution consumes it.
 *
 *  Deliberately NOT a `Pick` of the stored doc shape. Liveness is the TWO-field predicate
 *  over `active` AND `deletedAt`, so a port field named `active` would read as "the doc's
 *  `active` field" and an implementer returning `d.get("active")` would satisfy the type
 *  while readmitting the ghost shape (`active: true` with a non-null `deletedAt`) that
 *  mints the doc's real perms. Naming the semantic keeps the contract unspoofable by a
 *  plain field read.
 *
 *  Liveness *derivation* stays per-side, and NOT because of an import boundary: beacon's
 *  `isActiveRoleDoc` is fail-OPEN (`active !== false`, so a missing or non-bool `active`
 *  reads live) while backstage's `isLiveRole` is fail-CLOSED (`active === true`). They do
 *  not compute the same function, so unifying them would be a behaviour change, not a
 *  refactor. Only *consumption* is shared. */
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
 *  Iterating the deduped NAMES (not the docs) is what makes all three cases one expression:
 *  coverage is "this name has at least one claiming doc", so a doc whose `builtInKey` is
 *  not requested is ignored STRUCTURALLY — it is never visited. Grouping per name also
 *  handles two docs claiming one `builtInKey`: both live ones are unioned, where a
 *  `Map` keyed on the doc would have kept whichever arrived last.
 *
 *  `PERMISSION_CAP` is deliberately NOT applied: the callers disagree on the response
 *  (beacon fail-closes to `perms: []`, backstage blocks Save), so the cap stays theirs. */
export function resolveBuiltInPerms(input: {
  builtInRoleNames: readonly Role[];
  builtInDocs: readonly BuiltInRoleDoc[];
  customDocs: readonly Pick<RoleDefinition, "permissions">[];
  overrides?: { grant: PermissionCode[]; revoke: PermissionCode[] };
}): PermissionCode[] {
  // The return annotation is load-bearing: without it the two branches infer as a union of
  // two ARRAY types, which flatMap cannot flatten.
  const roleDocs = [...new Set(input.builtInRoleNames)].flatMap((name): PermsSource[] => {
    const claiming = input.builtInDocs.filter((doc) => doc.builtInKey === name);
    return claiming.length
      ? claiming.filter((doc) => doc.live)
      : [{ permissions: BUILT_IN_ROLE_PERMS[name] }];
  });
  return resolveEffectivePerms({
    roleDocs: [...roleDocs, ...input.customDocs],
    overrides: input.overrides,
  });
}
