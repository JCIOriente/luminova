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
// cargoTakedownOnly() / positionsLockedForEditor(), which is the point — a caller that
// re-derived the option list from this raw predicate is how the two forms drifted apart in
// the first place. Exporting it again would give that back.
function cargoAssignableByNonAdmin(cargo: Pick<Position, "grants" | "category">): boolean {
  return cargo.grants.length === 0 && cargo.category !== "CEL";
}

/** Module-local, like `cargoAssignableByNonAdmin`: the raw shape of the rules' OLD-side
 *  question, with no permission flag folded in. Every caller goes through
 *  `positionsLockedForEditor` / `cargoTakedownOnly`, which each fold in the flag the rules
 *  actually gate that side on — and those two flags are NOT the same one. */
function cargoConfersPower(cargo: Pick<Position, "grants" | "category"> | undefined): boolean {
  return cargo !== undefined && cargo.grants.length > 0;
}

/**
 * Whether this editor is barred from touching the positions slot AT ALL, given the cargo the
 * member currently holds. NOT the negation of `cargoAssignableByNonAdmin` — the two rules
 * conjuncts are asymmetric, and mirroring the wrong one strands a takedown:
 *
 *   grants.length > 0  →  locked. `currentCargoGrantsEmpty()` gates the cargo being REPLACED,
 *                         so the editor can neither keep it (the save re-stamps it) nor clear
 *                         it. Nothing they can do here succeeds.
 *   grant-free CEL     →  NOT locked. `currentCargoGrantsEmpty()` is deliberately not
 *                         category-gated — firestore.rules says denying this "would strand a
 *                         takedown behind an Admin" — so clearing the seat is allowed even
 *                         though keeping it is not. The cargo is dropped from the options
 *                         instead, which makes the only submittable states "clear" or "some
 *                         other assignable cargo" — exactly the rules' answer.
 *
 * `allowReplacePowerCargo` is a PARAMETER, and it is deliberately not the same flag as
 * `allowPowerGrants`. positionsAssignmentSafe() gates its two cargo conjuncts on different
 * principals, and this function mirrors the OLD one:
 *
 *   NEW side (cargoAssignableByNonAdmin, the cargo written IN)   → `allowPowerGrants`,
 *                                                                   which update:BoardSeat lifts.
 *   OLD side (currentCargoGrantsEmpty, the cargo REPLACED)       → Admin ROLE only, never
 *                                                                   delegated.
 *
 * The flag is taken here rather than `&&`-ed at each call site because that is exactly how the
 * two drifted: both forms typed `!allowPowerGrants && positionsLockedForNonAdmin(...)`, which
 * was correct only while `allowPowerGrants` MEANT `isAdmin`. Widening it to include the
 * delegate silently unlocked the editor for a write the rules always deny.
 */
export function positionsLockedForEditor(
  cargo: Pick<Position, "grants" | "category"> | undefined,
  allowReplacePowerCargo: boolean,
): boolean {
  return !allowReplacePowerCargo && cargoConfersPower(cargo);
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
    !cargoConfersPower(cargo)
  );
}

/**
 * A seat the editor may WRITE but whose grants will not be MINTED — the one outcome in this
 * lane that fails silently.
 *
 * `boardSeatDelegate()` lets an `update:BoardSeat` holder write any vacant cargo, Admin-granting
 * included, and the write succeeds; the seat even publishes to the Directiva. But
 * `resolveTrustedGrants` honors an Admin-conferring cargo only for an assigner holding the Admin
 * ROLE, so the member is seated with no Admin claim, and nothing in the save path says so. An
 * Admin re-saving the same slot re-stamps `assignedBy` and completes it.
 */
export function cargoGrantNeedsAdminAssigner(
  cargo: Pick<Position, "grants"> | undefined,
  assignerIsAdmin: boolean,
): boolean {
  return !assignerIsAdmin && cargo !== undefined && cargo.grants.includes("Admin");
}

export type CargoOption = { value: string; label: string; disabled?: boolean };

/**
 * The third derived render-state, alongside `positionsLockedForEditor` and
 * `cargoTakedownOnly`: this editor may assign, but the ceiling filtered every option away.
 *
 * Lives here for the same reason as its two siblings — both member forms ask it, and typing
 * the three-clause condition at each call site is how the two forms drift. `locked` is passed
 * in rather than recomputed because the forms derive it differently (one from the stored
 * cargo, one from `defaultValues`), and it must be excluded: a locked slot renders its own
 * note, and `cargoOptionsForEditor` appends the held cargo, so the two states cannot co-fire.
 */
export function noAssignableCargos(input: {
  cargoOptions: readonly CargoOption[];
  allowPowerGrants: boolean;
  locked: boolean;
}): boolean {
  return !input.locked && !input.allowPowerGrants && input.cargoOptions.length === 0;
}

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
