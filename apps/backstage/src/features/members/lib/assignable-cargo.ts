import { currentTermKey, positionTitle, type MemberGender, type Position } from "@luminova/types";

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
// Module-local: every consumer now goes through cargoOptionsForEditor() /
// cargoTakedownOnly() / positionsLockedForNonAdmin(), which is the point — a caller that
// re-derived the option list from this raw predicate is how the two forms drifted apart in
// the first place. Exporting it again would give that back.
function cargoAssignableByNonAdmin(cargo: Pick<Position, "grants" | "category">): boolean {
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

/**
 * The takedown-only state: the member is seated on a cargo this editor may NOT keep but MAY
 * clear — a grant-free CEL seat for a non-Admin. It is the one state where the honest render
 * is neither "pick anything" nor "locked":
 *   - the seat must still be VISIBLE (the holder holds it), so it is offered as a disabled
 *     option and the Combobox trigger shows its title instead of the "Sin cargo" placeholder;
 *   - the seat must not be re-submittable (the rules 403 any positions write that keeps it);
 *   - clearing it must be reachable, which a disabled option cannot do on its own — Combobox
 *     clears by re-selecting the SELECTED option, and a disabled item swallows the select. So
 *     the forms render an explicit "Quitar cargo" action while this is true.
 * Takes the CURRENT selection, not the stored one: once cleared or switched away the state is
 * over, and the takedown affordance goes with it.
 */
export function cargoTakedownOnly(
  cargo: Pick<Position, "grants" | "category"> | undefined,
  allowPowerGrants: boolean,
): boolean {
  return (
    !allowPowerGrants &&
    cargo !== undefined &&
    !cargoAssignableByNonAdmin(cargo) &&
    !positionsLockedForNonAdmin(cargo)
  );
}

export type CargoOption = { value: string; label: string; disabled?: boolean };

/**
 * The cargo Combobox options for one editor, shared by both member forms so they cannot
 * disagree about the same rules predicate (they did: one dropped the held CEL seat, the other
 * re-added it labelled "(inactivo)" — an ACTIVE cargo, mislabelled and re-offered to the very
 * editor whose write the rules reject).
 *
 * Assignable cargos of the current term, plus the HELD cargo when it is not among them —
 * appended `disabled` when this editor may not assign it, so the trigger tells the truth about
 * who holds what without making a denied write one click away. Keyed on the stored assignment,
 * never the live selection: an option list that reacts to the selection deletes the entry the
 * user just switched away from, so switching back is impossible.
 */
export function cargoOptionsForEditor({
  positions,
  gender,
  allowPowerGrants,
  assignedCargoId,
  term = currentTermKey(),
}: {
  positions: Position[];
  gender: MemberGender | undefined;
  allowPowerGrants: boolean;
  assignedCargoId: string | null | undefined;
  term?: string;
}): CargoOption[] {
  const currentTerm = (p: Position) => p.term === null || String(p.term) === term;
  const options = positions
    .filter((p) => p.active && p.category !== "Comision" && currentTerm(p))
    .filter((p) => allowPowerGrants || cargoAssignableByNonAdmin(p))
    .map((p) => ({ value: p.id, label: positionTitle(p, gender) }));

  const held = assignedCargoId ? positions.find((p) => p.id === assignedCargoId) : undefined;
  if (held === undefined || options.some((o) => o.value === held.id)) return options;
  const retired = !held.active || !currentTerm(held);
  return [
    ...options,
    {
      value: held.id,
      label: retired ? `${positionTitle(held, gender)} (inactivo)` : positionTitle(held, gender),
      disabled: !allowPowerGrants && !cargoAssignableByNonAdmin(held),
    },
  ];
}
