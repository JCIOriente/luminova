import type { Position } from "@luminova/types";

/**
 * Client mirror of firestore.rules `cargoAssignableByNonAdmin()` — the two questions a
 * non-Admin assignment must answer about the cargo being written in:
 *   grants.length === 0   the claims-mint boundary (assigning it would mint custom claims).
 *   category !== "CEL"    the publication boundary. boardGroupFromCategory publishes CEL and
 *                         JDL alike and boardRank puts 'Presidente' at rank 0, so a
 *                         grant-free CEL cargo seats its holder at the head of the
 *                         world-readable Directiva. JDL direcciones stay assignable — that
 *                         is the accepted exposure this lane exists to deliver.
 *
 * The rules apply it on BOTH member lanes (`createPositionsSafe` and
 * `positionsAssignmentSafe`), so both member forms apply it here. One function, not a
 * `grants.length === 0` re-typed per form: rendering an option the save will 403 on is the
 * render-then-die shape this repo guards against, and two copies drift.
 */
export function cargoAssignableByNonAdmin(cargo: Pick<Position, "grants" | "category">): boolean {
  return cargo.grants.length === 0 && cargo.category !== "CEL";
}

/**
 * Whether a non-Admin is barred from touching the positions slot AT ALL, given the cargo the
 * member currently holds. NOT the negation of `cargoAssignableByNonAdmin` — the two rules
 * conjuncts are asymmetric, and mirroring the wrong one strands a takedown:
 *
 *   grants.length > 0  →  locked. `currentCargoGrantsEmpty()` gates the cargo being REPLACED,
 *                         so a non-Admin can neither keep it (the save re-stamps it) nor clear
 *                         it. Nothing they can do here succeeds.
 *   grant-free CEL     →  NOT locked. `currentCargoGrantsEmpty()` is deliberately not
 *                         category-gated — firestore.rules says denying this "would strand a
 *                         takedown behind an Admin" — so clearing the seat is allowed even
 *                         though keeping it is not. The cargo is dropped from the options
 *                         instead, which makes the only submittable states "clear" or "some
 *                         other assignable cargo" — exactly the rules' answer.
 */
export function positionsLockedForNonAdmin(
  cargo: Pick<Position, "grants" | "category"> | undefined,
): boolean {
  return cargo !== undefined && cargo.grants.length > 0;
}
