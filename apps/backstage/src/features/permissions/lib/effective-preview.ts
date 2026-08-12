import { resolveEffectivePerms } from "@luminova/auth/perms";
import {
  BUILT_IN_ROLE_PERMS,
  type PermissionCode,
  type Role,
  type RoleDefinition,
} from "@luminova/types";
import { assignableRoles, isLiveRole } from "../../../lib/role-lifecycle";

/** Client-side mirror of the beacon resolution for the member-assignment preview:
 *  effective perms = built-in roles (held via positions) ∪ selected custom roles ∪
 *  override grants − revokes.
 *
 *  Three-way per built-in key, exactly as resolveMemberPerms does it:
 *    - doc ABSENT            → the BUILT_IN_ROLE_PERMS snapshot (pre-seed window)
 *    - doc present, live     → the doc's permissions
 *    - doc present, inactive → nothing, and the key stays COVERED (so the snapshot
 *                              must NOT come back)
 *
 *  The CUSTOM path filters too. members.roleIds keeps naming a deactivated custom role
 *  (softDelete never scrubs roleIds), and beacon's getRolesByIds drops inactive docs —
 *  a preview that counted them would overstate the member's perms. */
export function previewEffectivePerms(input: {
  builtInRoleNames: Role[];
  selectedCustomRoleIds: string[];
  allRoles: RoleDefinition[];
  overrides: { grant: PermissionCode[]; revoke: PermissionCode[] };
}): PermissionCode[] {
  const byId = new Map(assignableRoles(input.allRoles).map((r) => [r.id, r]));
  // Keyed off ALL docs, live or not: coverage is what suppresses the snapshot.
  const byBuiltInKey = new Map(
    input.allRoles
      .filter((r) => r.builtIn && r.builtInKey !== null)
      .map((r) => [r.builtInKey as Role, r]),
  );
  const builtInDocs = input.builtInRoleNames.map((name) => {
    const doc = byBuiltInKey.get(name);
    if (doc === undefined) return { permissions: BUILT_IN_ROLE_PERMS[name] };
    return isLiveRole(doc) ? doc : { permissions: [] };
  });
  const customDocs = input.selectedCustomRoleIds
    .map((id) => byId.get(id))
    .filter((r): r is RoleDefinition => r !== undefined);
  return resolveEffectivePerms({
    roleDocs: [...builtInDocs, ...customDocs],
    overrides: input.overrides,
  });
}
