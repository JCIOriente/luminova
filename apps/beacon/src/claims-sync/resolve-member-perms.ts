import type { Role } from "@luminova/auth/roles";
import { resolveEffectivePerms } from "@luminova/auth/perms";
import { BUILT_IN_ROLE_PERMS } from "@luminova/types/role-definition";
import type { PermissionCode, RoleDefinition } from "@luminova/types";

export interface RolePermsDeps {
  /** EVERY built-in role doc matching these keys by builtInKey — active AND inactive.
   *  Returning the inactive ones is load-bearing: they contribute no perms but they do
   *  COVER their key, which is the only thing that tells "deactivated" apart from
   *  "never seeded". Filter them out here and a deactivation silently restores the
   *  seed snapshot through the fallback below. */
  getRoleDocsByBuiltInKeys(
    keys: Role[],
  ): Promise<Pick<RoleDefinition, "permissions" | "builtInKey" | "active">[]>;
  /** Custom role docs by id — ACTIVE only. There is no fallback on this path, so
   *  dropping an inactive doc already yields zero perms. */
  getRolesByIds(ids: string[]): Promise<Pick<RoleDefinition, "permissions">[]>;
}

/** Resolve a member's effective coarse perms from every source: the live perms of
 *  the built-in roles they hold (via positions), their directly-assigned custom
 *  roles, and their per-member overrides.
 *
 *  Three-way per built-in key:
 *    - doc ABSENT             → BUILT_IN_ROLE_PERMS[key] (the pre-seed window must
 *                               still mint perms on a fresh project)
 *    - doc present, active    → the doc's live `permissions`
 *    - doc present, inactive  → nothing, and the key stays COVERED
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
  const covered = new Set(builtInDocs.map((doc) => doc.builtInKey));
  const fallback = builtInRoleNames
    .filter((role) => !covered.has(role))
    .map((role) => ({ permissions: BUILT_IN_ROLE_PERMS[role] }));
  const customDocs = roleIds.length ? await deps.getRolesByIds(roleIds) : [];
  return resolveEffectivePerms({
    roleDocs: [...builtInDocs.filter((doc) => doc.active), ...fallback, ...customDocs],
    overrides,
  });
}
