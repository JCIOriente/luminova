import { ROLES, type Member, type Position, type Role } from "@luminova/types";

// Cargo grants only — comisiones are chips-only, matching the claims-sync trigger, which
// ignores comisión grants. This is the UPPER BOUND of what the trigger will mint, not an
// exact mirror: resolveTrustedGrants (apps/beacon/src/claims-sync/sync.ts) additionally
// requires the cargo's `assignedBy` to hold Admin, and drops every grant when it does not.
// So a cargo assigned by a non-Admin shows here and mints nothing.
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
