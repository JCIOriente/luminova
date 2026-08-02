import type { Member, Position, RoleDefinition } from "@luminova/types";
import { effectiveRoles } from "../../members/lib/member-permissions";

export interface RoleOverviewRow {
  role: RoleDefinition;
  /** Cargos whose `grants` confer this role. Always empty for a custom role. */
  grantingCargos: string[];
  holders: { id: string; name: string }[];
}

/** One row per role doc, unioning BOTH assignment paths: a built-in role arrives through
 *  a cargo's `grants`, a custom role through `members.roleIds`. Reading only the cargo
 *  path (as the former buildPermissionsOverview did) reports "Nadie aún" for every custom
 *  role that has holders. */
export function buildRoleOverview(
  roles: RoleDefinition[],
  positions: Position[],
  members: Member[],
  termKey: string,
): RoleOverviewRow[] {
  const positionsById = new Map(positions.map((position) => [position.id, position]));
  const memberRoles = members.map((member) => ({
    member,
    roles: effectiveRoles(member, positionsById, termKey),
  }));

  return roles.map((role) => {
    const key = role.builtInKey;
    return {
      role,
      grantingCargos:
        key === null
          ? []
          : positions
              .filter((position) => position.active && position.grants.includes(key))
              .map((position) => position.title),
      holders: memberRoles
        .filter(({ member, roles: effective }) =>
          key === null ? (member.roleIds ?? []).includes(role.id) : effective.includes(key),
        )
        .map(({ member }) => ({ id: member.id, name: member.name })),
    };
  });
}
