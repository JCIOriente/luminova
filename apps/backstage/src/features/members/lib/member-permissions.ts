import { ROLES, type Member, type Position, type Role } from "@luminova/types";

export function effectiveRoles(
  member: Pick<Member, "positions">,
  positionsById: Map<string, Position>,
  termKey: string,
): Role[] {
  const term = member.positions?.[termKey];
  const ids = term ? [term.cargoId, ...term.comisionIds].filter((id): id is string => !!id) : [];
  const set = new Set<Role>(["Member"]);
  for (const id of ids) for (const g of positionsById.get(id)?.grants ?? []) set.add(g);
  return ROLES.filter((r) => set.has(r));
}
