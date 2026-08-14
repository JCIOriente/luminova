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
