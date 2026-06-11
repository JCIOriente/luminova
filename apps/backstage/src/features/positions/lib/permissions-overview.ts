import type { Member, Position, Role } from "@luminova/types";
import { effectiveRoles } from "../../members/lib/member-permissions";

export interface PermissionRow {
  role: Role;
  grantingCargos: string[];
  holders: { id: string; name: string }[];
}

export const MANAGED_ROLES: Role[] = [
  "Admin",
  "Membership",
  "Treasury",
  "ExecutiveCommittee",
  "ProjectManager",
];

export function buildPermissionsOverview(
  positions: Position[],
  members: Member[],
  termKey: string,
): PermissionRow[] {
  const positionsById = new Map(positions.map((p) => [p.id, p]));
  const memberRoles = members.map((m) => ({ m, roles: effectiveRoles(m, positionsById, termKey) }));
  return MANAGED_ROLES.map((role) => ({
    role,
    grantingCargos: positions
      .filter((p) => p.active && p.grants.includes(role))
      .map((p) => p.title),
    holders: memberRoles
      .filter(({ roles }) => roles.includes(role))
      .map(({ m }) => ({ id: m.id, name: m.name })),
  }));
}
