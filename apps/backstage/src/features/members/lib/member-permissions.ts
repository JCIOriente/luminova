import { ROLES, type Member, type Position, type Role } from "@luminova/types";

/**
 * Whether this member doc IS the signed-in user.
 *
 * The `uid !== undefined` half is the whole reason this is a function: an unprovisioned member
 * has no `uid`, and so does a caller whose auth has not resolved yet, so a bare `===` reads
 * `undefined === undefined` and calls a stranger "yourself". That answer feeds
 * `isSelfAssignment`, which decides whether the delegate is warned that seating this member
 * mints nothing — get it wrong and the warning fires on the wrong person, or not at all.
 *
 * Three call sites had this typed out by hand (both cargo editors and /me's self-edit gate).
 */
export function isSelfMember(member: Pick<Member, "uid">, uid: string | undefined): boolean {
  return member.uid !== undefined && member.uid === uid;
}

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
