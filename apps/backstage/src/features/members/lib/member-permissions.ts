import { ROLES, type Member, type Position, type Role } from "@luminova/types";

// Cargo grants only — comisiones are chips-only, so the panel mirrors exactly
// what the claims-sync trigger will mint (rules⇄client parity).
export function effectiveRoles(
  member: Pick<Member, "positions">,
  positionsById: Map<string, Position>,
  termKey: string,
): Role[] {
  const cargoId = member.positions?.[termKey]?.cargoId;
  const set = new Set<Role>(["Member"]);
  if (cargoId) for (const g of positionsById.get(cargoId)?.grants ?? []) set.add(g);
  return ROLES.filter((r) => set.has(r));
}
