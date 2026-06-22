import { resolveEffectivePerms } from "@luminova/auth/perms";
import { BUILT_IN_ROLE_PERMS, type PermissionCode, type Role, type RoleDefinition } from "@luminova/types";

/** Client-side mirror of the beacon resolution for the member-assignment preview:
 *  effective perms = built-in roles (held via positions) ∪ selected custom roles ∪
 *  override grants − revokes. Built-in perms come from the live role docs when
 *  available, falling back to the seed snapshot. */
export function previewEffectivePerms(input: {
  builtInRoleNames: Role[];
  selectedCustomRoleIds: string[];
  allRoles: RoleDefinition[];
  overrides: { grant: PermissionCode[]; revoke: PermissionCode[] };
}): PermissionCode[] {
  const byId = new Map(input.allRoles.map((r) => [r.id, r]));
  const byBuiltInKey = new Map(
    input.allRoles
      .filter((r) => r.builtIn && r.builtInKey !== null)
      .map((r) => [r.builtInKey as Role, r]),
  );
  const builtInDocs = input.builtInRoleNames.map(
    (name) => byBuiltInKey.get(name) ?? { permissions: BUILT_IN_ROLE_PERMS[name] },
  );
  const customDocs = input.selectedCustomRoleIds
    .map((id) => byId.get(id))
    .filter((r): r is RoleDefinition => r !== undefined);
  return resolveEffectivePerms({
    roleDocs: [...builtInDocs, ...customDocs],
    overrides: input.overrides,
  });
}
