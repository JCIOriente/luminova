/**
 * The rules-mirroring half of `assignable-cargo.ts`: every predicate that answers a
 * `firestore.rules` question about a cargo, and nothing that renders one.
 *
 * Split out for ONE reason, and it is load-bearing: `tests/firestore-rules/` drives these
 * predicates and the real emulator from the same fixture
 * (`cargo-assignment-parity.test.ts`), and that package cannot resolve `@luminova/types` at
 * runtime — it has no such dependency, and the rules suite deliberately keeps its dependency
 * surface to the emulator harness. `assignable-cargo.ts` imports `currentTermKey` and
 * `positionTitle` from it for VALUE, so importing that file there throws. This module has ZERO
 * imports, which is the same trick `nav-equivalence.test.ts` documents for `nav-config.ts`.
 *
 * Nothing changed shape: `assignable-cargo.ts` re-exports the two predicates it used to own
 * (`positionsLockedForEditor`, `cargoTakedownOnly`) and wraps `cargoSlotsForEditor` back into
 * `cargoOptionsForEditor`, so every call site and the existing unit test import exactly what
 * they always did. What deliberately did NOT move: the render states
 * (`noAssignableCargos`, `cargoNoteId`), the labelling itself, and
 * `cargoGrantNeedsAdminAssigner` — which mirrors BEACON's trust gate, not a rules predicate,
 * so no rules parity test can hold it and it has no business here.
 */

/**
 * The cargo fields these predicates read — structural, deliberately NOT `Pick<Position, …>`,
 * so this module stays import-free (see the header). Every real `Position` satisfies it, so
 * callers pass their `Position` objects unchanged and `cargoSlotsForEditor` returns the very
 * objects it was handed (it is generic in `P`), never a lossy copy.
 *
 * ACCEPTED TRADEOFF: `category` and `grants` are wider here than `Position`'s literal unions,
 * because narrowing them would mean either importing those unions (which is the one thing this
 * module may not do) or re-declaring them, and a re-declared union drifts. So a hand-built
 * FIXTURE could pass `category: "cel"` and get a wrong answer with no compile error. Every
 * production caller passes a real `Position`, and `cargoSlotsForEditor` being generic in
 * `P extends CargoLike` means `assignable-cargo.ts` handing it `Position[]` already enforces
 * `Position extends CargoLike` — which is the direction that can actually break.
 */
export interface CargoLike {
  id: string;
  grants: readonly string[];
  category: string;
  term: number | null;
  active: boolean;
}

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
// Module-local: every consumer goes through cargoOptionsForEditor() / cargoTakedownOnly() /
// positionsLockedForEditor(), which is the point — a caller that re-derived the option list
// from this raw predicate is how the two forms drifted apart in the first place. Exporting it
// again would give that back.
function cargoAssignableByNonAdmin(cargo: Pick<CargoLike, "grants" | "category">): boolean {
  return cargo.grants.length === 0 && cargo.category !== "CEL";
}

/** The raw shape of the rules' OLD-side question, with no permission flag folded in. Every
 *  caller goes through `positionsLockedForEditor` / `cargoTakedownOnly` /
 *  `cargoGrantNeedsAdminAssigner`, which each fold in the flag the rules actually gate that
 *  side on — and those flags are NOT all the same one.
 *
 *  Exported ONLY so `cargoGrantNeedsAdminAssigner` can keep living next to the render states
 *  in `assignable-cargo.ts` (it mirrors beacon's trust gate, not a rules predicate, so it has
 *  no business here). Do not derive an option list from it: a call site that re-derives
 *  "assignable" from the raw predicates is how the two member forms drifted apart. */
export function cargoConfersPower(cargo: Pick<CargoLike, "grants"> | undefined): boolean {
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
  cargo: Pick<CargoLike, "grants" | "category"> | undefined,
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
  cargo: Pick<CargoLike, "grants" | "category"> | undefined,
  allowPowerGrants: boolean,
): boolean {
  return (
    !allowPowerGrants &&
    cargo !== undefined &&
    !cargoAssignableByNonAdmin(cargo) &&
    !cargoConfersPower(cargo)
  );
}

/** One row of the cargo Combobox, before labelling. `retired` and `disabled` are the two
 *  things the label/render layer needs and the predicates above decide. */
export interface CargoSlot<P extends CargoLike> {
  position: P;
  /** Not assignable any more: deactivated, or belonging to a past term. Labelled "(inactivo)". */
  retired: boolean;
  /** The rules would 403 a write keeping this cargo — shown for truth, not submittable. */
  disabled: boolean;
}

/**
 * WHICH cargos this editor may pick, and which of them are shown-but-denied. The whole of
 * `cargoOptionsForEditor` except the labels, so the parity test can drive the real rules
 * predicate without `positionTitle` (see the header).
 *
 * Assignable cargos of `term`, plus the HELD cargo when it is not among them — appended
 * `disabled` when this editor may not assign it, so the trigger tells the truth about who holds
 * what without making a denied write one click away. Keyed on the stored assignment, never the
 * live selection: an option list that reacts to the selection deletes the entry the user just
 * switched away from, so switching back is impossible.
 */
export function cargoSlotsForEditor<P extends CargoLike>({
  positions,
  allowPowerGrants,
  assignedCargoId,
  term,
}: {
  positions: readonly P[];
  allowPowerGrants: boolean;
  assignedCargoId: string | null | undefined;
  term: string;
}): CargoSlot<P>[] {
  const currentTerm = (p: P) => p.term === null || String(p.term) === term;
  const slots = positions
    .filter((p) => p.active && p.category !== "Comision" && currentTerm(p))
    .filter((p) => allowPowerGrants || cargoAssignableByNonAdmin(p))
    .map((p) => ({ position: p, retired: false, disabled: false }));

  const held = assignedCargoId ? positions.find((p) => p.id === assignedCargoId) : undefined;
  if (held === undefined || slots.some((s) => s.position.id === held.id)) return slots;
  return [
    ...slots,
    {
      position: held,
      retired: !held.active || !currentTerm(held),
      disabled: !allowPowerGrants && !cargoAssignableByNonAdmin(held),
    },
  ];
}
