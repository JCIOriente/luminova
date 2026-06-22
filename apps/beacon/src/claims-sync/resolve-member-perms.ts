import type { Role } from "@luminova/auth/roles";
import { resolveEffectivePerms } from "@luminova/auth/perms";
import { BUILT_IN_ROLE_PERMS } from "@luminova/types/role-definition";
import type { PermissionCode, RoleDefinition } from "@luminova/types";

export interface RolePermsDeps {
  /** Live built-in role docs (editable) matching these role names by builtInKey. */
  getRoleDocsByBuiltInKeys(keys: Role[]): Promise<Pick<RoleDefinition, "permissions" | "builtInKey">[]>;
  /** Custom role docs by id. */
  getRolesByIds(ids: string[]): Promise<Pick<RoleDefinition, "permissions">[]>;
}

/** Resolve a member's effective coarse perms from every source: the live perms of
 *  the built-in roles they hold (via positions), their directly-assigned custom
 *  roles, and their per-member overrides. A built-in role with no seeded doc yet
 *  falls back to the BUILT_IN_ROLE_PERMS snapshot so the pre-seed window is safe. */
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
    roleDocs: [...builtInDocs, ...fallback, ...customDocs],
    overrides,
  });
}
