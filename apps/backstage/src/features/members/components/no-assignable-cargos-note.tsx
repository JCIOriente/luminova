import type { CargoNoteIds } from "../lib/assignable-cargo";
import { permissionLabel } from "../../permissions/lib/permission-matrix";

/**
 * Every id a form's cargo `aria-describedby` can point at, derived from that form's `prefix`.
 *
 * `cargoNoteId` was extracted because "a re-typed ternary at each call site is how they
 * drift" — and both forms then hand-copied a four-entry literal to CALL it, byte-identical
 * apart from two constant names. That is the same drift one layer out, so the literal lives
 * here now: a fifth note added to `CargoNoteIds` fails to compile HERE, once, instead of
 * silently leaving `aria-describedby` unset in whichever form was forgotten.
 *
 * ALL FOUR are prefixed, including the two whose notes are shared components. Two of these
 * notes render identical copy in both forms, which is why the components are shared — but a
 * shared component owning a fixed DOM id means two mounted forms emit the same id, and
 * `aria-describedby` then resolves to whichever rendered first, i.e. the OTHER form's note.
 * Nothing mounts both cargo editors today (the profile page picks one via `memberEditMode`),
 * but that fact lives in another file, so the shared notes take their id as a prop and the
 * uniqueness is structural instead of circumstantial.
 */
export function cargoNoteIds(prefix: string): CargoNoteIds {
  return {
    noCargos: `${prefix}-cargo-no-assignable-note`,
    locked: `${prefix}-cargo-locked-note`,
    takedown: `${prefix}-cargo-takedown-note`,
    mintPending: `${prefix}-cargo-mint-pending-note`,
  };
}

/** Why the Cargo picker is empty, for an editor who is not a board-seat delegate.
 *
 *  Without it the Combobox renders its bare "Sin resultados" and the editor cannot tell a
 *  permission ceiling from an empty catalog — which is the state a chapter whose every cargo
 *  carries grants lands in permanently.
 *
 *  Shared by both member forms rather than typed into each: the `locked` and `takedownOnly`
 *  notes legitimately differ in wording between them, this one does not. `id` comes from the
 *  caller's `cargoNoteIds(prefix)` — see there for why a shared component must not own it.
 *
 *  The permission is NAMED through `permissionLabel`, not spelled out here. It is the one
 *  place a user is told which permission to go ask an Admin for, and a hardcoded copy would
 *  drift silently the first time either half of that label is renamed. */
export function NoAssignableCargosNote({ id }: { id: string }) {
  return (
    <p id={id} role="note" className="text-ui-xs text-ink-3">
      Ningún cargo del catálogo es asignable con tus permisos. Los cargos del Comité Ejecutivo Local
      y los que otorgan permisos requieren un administrador o el permiso «
      {permissionLabel("update:BoardSeat")}».
    </p>
  );
}

/** Why a cargo this editor CAN assign will not actually confer its permissions — see
 *  `cargoGrantNeedsAdminAssigner`. Shared by both forms for the same reason as the note above:
 *  the wording does not differ between them, so a second copy would only drift. */
export function MintPendingNote({ id }: { id: string }) {
  return (
    <p id={id} role="note" className="text-ui-xs text-ink-3">
      Este cargo otorga permisos, pero no se aplicarán hasta que un administrador confirme la
      asignación. El cargo sí queda registrado y visible.
    </p>
  );
}
