import {
  currentTermKey,
  positionTitle,
  type MemberGender,
  type Position,
  type PositionCategory,
} from "@luminova/types";
import { cargoConfersPower, cargoSlotsForEditor } from "./assignable-cargo-core";

// The guard the CargoLike widening gave up, bought back here where Position IS importable.
// assignable-cargo-core compares `category !== "CEL"` against a structural `string`, so if
// POSITION_CATEGORIES ever renames or recases that literal, the comparison silently becomes
// always-true — the client would offer every CEL cargo to a non-delegate while the rules keep
// denying `category != 'CEL'`, on the publication boundary that module exists to mirror. With
// the literal typed, a rename fails to compile HERE instead.
const CEL: PositionCategory = "CEL";
void CEL;

/**
 * The predicates that MIRROR firestore.rules — `positionsLockedForEditor`,
 * `cargoTakedownOnly` and the option ceiling — live in `./assignable-cargo-core`, an
 * import-free module, so `tests/firestore-rules/cargo-assignment-parity.test.ts` can drive
 * them and the real emulator from one fixture. That package cannot resolve `@luminova/types`,
 * which this file needs for VALUE (`currentTermKey`, `positionTitle`), so a test importing
 * THIS module would throw at load. Same trick `nav-equivalence.test.ts` documents for
 * `nav-config.ts`.
 *
 * Every caller imports those two DIRECTLY from `./assignable-cargo-core`, and that is the
 * point rather than an inconvenience: which file a predicate comes from is what says whether
 * the emulator parity test holds it to `firestore.rules` or whether it is local render state.
 * A pass-through re-export here erased exactly that distinction (and was a barrel besides —
 * CLAUDE.md: import directly from the file).
 *
 * What lives HERE: the render states (`noAssignableCargos`, `cargoNoteId`), the labelling half
 * of `cargoOptionsForEditor`, and `cargoGrantNeedsAdminAssigner` — which mirrors BEACON's trust
 * gate, not a rules predicate, so the rules-parity module is the wrong home for it. Nothing in
 * this file is covered by the parity test.
 */

/**
 * A seat the editor may WRITE but whose grants will not be MINTED — the one outcome in this
 * lane that fails silently. The rules allow the write, the seat publishes to the Directiva, and
 * `syncMemberClaims` is a trigger, so there is no response the client could learn this from.
 * Warning before the click is the only channel.
 *
 * Mirrors BOTH refusals in `resolveTrustedGrants`, which are disjoint and were separately
 * argued for — covering only the first is how this note would go quietly half-right:
 *   grants include Admin  →  honored only for an assigner holding the Admin ROLE.
 *   SELF-assignment       →  honored only for an Admin, WHATEVER the cargo grants. A delegate
 *                            may confer power on others, never on themselves.
 *
 * `assignerIsAdmin` is the MINTING authority (beacon's `assignerIsAdmin`), deliberately named
 * after that rather than after `allowReplacePowerCargo`, which mirrors a different predicate
 * (`currentCargoGrantsEmpty`) and merely happens to equal it today. Feeding one to the other is
 * the conflation this file exists to prevent.
 *
 * An Admin re-saving the same slot re-stamps `assignedBy` and completes the mint.
 */
export function cargoGrantNeedsAdminAssigner(
  cargo: Pick<Position, "grants"> | undefined,
  assignerIsAdmin: boolean,
  isSelfAssignment: boolean,
): boolean {
  if (assignerIsAdmin || !cargoConfersPower(cargo)) return false;
  return isSelfAssignment || (cargo?.grants.includes("Admin") ?? false);
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
 * Which note the cargo Combobox's `aria-describedby` should point at — the fourth derived
 * render-state, and here for the same reason as the other three: both forms ask it, and a
 * re-typed ternary at each call site is how they drift.
 *
 * Order is priority and it is load-bearing, because of the one pair that CAN co-fire:
 *   locked ∧ mintPending    REACHABLE — a delegate opening a member seated on an Admin-granting
 *                           cargo has both. `locked` must win: the mint note's render is guarded
 *                           by `!locked`, so pointing aria-describedby at it would reference an
 *                           element that is not in the DOM, which is worse than no association.
 *   takedown ∧ mintPending   impossible — takedown needs grants.length === 0, mintPending needs
 *                            grants.length > 0, both off the same selected cargo.
 *   noCargos ∧ locked        impossible — a locked slot's held cargo is always in the list.
 * The remaining three pairs are unreachable only because of facts OUTSIDE this file — the
 * Combobox is `disabled={locked}`, so the selection cannot leave the held cargo, and
 * `cargoSlotsForEditor` never offers a grant-free CEL while `!allowPowerGrants`. Change either
 * and `locked ∧ takedown` becomes reachable, at which point this order matters again.
 * First match wins, most-blocking first: not being able to pick anything outranks what a pick
 * would mint.
 *
 * The ids differ per form (the locked and takedown wordings legitimately differ between them),
 * so they are passed in rather than owned here. Build the argument with `cargoNoteIds(prefix)`
 * (./../components/no-assignable-cargos-note) — never by hand: this signature is the only
 * thing that would notice a form that forgot one, and it cannot notice a copy that has all
 * four but points one at the OTHER form's element.
 */
export interface CargoNoteIds {
  noCargos: string;
  locked: string;
  takedown: string;
  mintPending: string;
}

export function cargoNoteId(
  state: { noCargos: boolean; locked: boolean; takedown: boolean; mintPending: boolean },
  ids: CargoNoteIds,
): string | undefined {
  if (state.noCargos) return ids.noCargos;
  if (state.locked) return ids.locked;
  if (state.takedown) return ids.takedown;
  if (state.mintPending) return ids.mintPending;
  return undefined;
}

/**
 * The cargo Combobox options for one editor, shared by both member forms so they cannot
 * disagree about the same rules predicate (they did: one dropped the held CEL seat, the other
 * re-added it labelled "(inactivo)" — an ACTIVE cargo, mislabelled and re-offered to the very
 * editor whose write the rules reject).
 *
 * WHICH cargos, and which of them are shown-but-denied, is `cargoSlotsForEditor`
 * (./assignable-cargo-core) — the rules mirror, held to the emulator by the parity test. This
 * function is the labelling layer over it: gendered titles, plus the "(inactivo)" suffix on a
 * held cargo that is deactivated or belongs to a past term.
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
  return cargoSlotsForEditor({ positions, allowPowerGrants, assignedCargoId, term }).map(
    ({ position, retired, disabled }) => ({
      value: position.id,
      label: retired
        ? `${positionTitle(position, gender)} (inactivo)`
        : positionTitle(position, gender),
      ...(disabled ? { disabled } : {}),
    }),
  );
}
