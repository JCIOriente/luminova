import type { Role } from "@luminova/auth/roles";
import { resolveBuiltInPerms } from "@luminova/auth/built-in-perms";
import type { PermissionCode, RoleDefinition } from "@luminova/types";

/** A built-in role doc as this resolver's PORT produces it. Structurally the shared
 *  `BuiltInRoleDoc` from `@luminova/auth/built-in-perms` — restated here rather than
 *  aliased so `firestore-deps.ts` keeps a beacon-local name to build against, and checked
 *  by the compiler where `resolveBuiltInPerms` consumes it below, with no cast.
 *
 *  `live` is deliberately NOT `RoleDefinition["active"]`, and this type is deliberately
 *  not a `Pick` of the doc shape: liveness is the TWO-field predicate `isActiveRoleDoc`
 *  computes over `active` AND `deletedAt`. A port field named `active` reads as "the doc's
 *  `active` field", so an implementer returning `d.get("active")` would satisfy the type
 *  while readmitting the ghost shape (`active: true` with a non-null `deletedAt`) that
 *  mints the doc's real perms — the failure the three `resolveMemberPerms` liveness tests
 *  exist to catch. Naming the semantic keeps the contract unspoofable by a plain field read. */
export interface LiveBuiltInRoleDoc {
  permissions: PermissionCode[];
  builtInKey: Role;
  /** `isActiveRoleDoc(doc)` — active AND not soft-deleted. Never the raw `active` field. */
  live: boolean;
}

export interface RolePermsDeps {
  /** EVERY built-in role doc matching these keys by builtInKey — live AND not-live.
   *  Returning the not-live ones is load-bearing: they contribute no perms but they do
   *  COVER their key, which is the only thing that tells "deactivated" apart from
   *  "never seeded". Filter them out here and a deactivation silently restores the
   *  seed snapshot through the fallback below. */
  getRoleDocsByBuiltInKeys(keys: Role[]): Promise<LiveBuiltInRoleDoc[]>;
  /** Custom role docs by id — ACTIVE only. There is no fallback on this path, so
   *  dropping an inactive doc already yields zero perms. */
  getRolesByIds(ids: string[]): Promise<Pick<RoleDefinition, "permissions">[]>;
}

/** Resolve a member's effective coarse perms from every source: the live perms of
 *  the built-in roles they hold (via positions), their directly-assigned custom
 *  roles, and their per-member overrides.
 *
 *  This function owns the FETCH orchestration only; the absent/live/inactive three-way
 *  — including the `BUILT_IN_ROLE_PERMS` fallback — lives in `resolveBuiltInPerms`
 *  (`@luminova/auth/built-in-perms`), shared with the backstage assignment preview so the
 *  admin authorizes from the same resolution beacon then mints. `PERMISSION_CAP` stays out
 *  of the shared half: this side fail-closes to `perms: []` in `sync.ts`, backstage blocks
 *  Save. Liveness DERIVATION also stays here (`isActiveRoleDoc` reads `DocumentData`),
 *  only its consumption is shared.
 *
 *  Two production callers inherit this: claims-sync/sync.ts (the onMemberWritten /
 *  onRoleWritten trigger) and set-user-roles.ts (the setUserRoles admin callable). */
export async function resolveMemberPerms(
  deps: RolePermsDeps,
  builtInRoleNames: Role[],
  roleIds: string[],
  overrides: { grant: PermissionCode[]; revoke: PermissionCode[] },
): Promise<PermissionCode[]> {
  const builtInDocs = builtInRoleNames.length
    ? await deps.getRoleDocsByBuiltInKeys(builtInRoleNames)
    : [];
  const customDocs = roleIds.length ? await deps.getRolesByIds(roleIds) : [];
  return resolveBuiltInPerms({ builtInRoleNames, builtInDocs, customDocs, overrides });
}
