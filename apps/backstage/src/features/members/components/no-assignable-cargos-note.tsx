import { permissionLabel } from "../../permissions/lib/permission-matrix";

/** The id both member forms point the Cargo Combobox's `aria-describedby` at. A constant, not
 *  a prop: only one of these renders per form, and the association is the whole reason a
 *  screen-reader user reaching the empty picker hears more than "Sin resultados". */
export const NO_ASSIGNABLE_CARGOS_NOTE_ID = "cargo-no-assignable-note";

/** Why the Cargo picker is empty, for an editor who is not a board-seat delegate.
 *
 *  Without it the Combobox renders its bare "Sin resultados" and the editor cannot tell a
 *  permission ceiling from an empty catalog — which is the state a chapter whose every cargo
 *  carries grants lands in permanently.
 *
 *  Shared by both member forms rather than typed into each: the `locked` and `takedownOnly`
 *  notes legitimately differ in wording between them, this one does not.
 *
 *  The permission is NAMED through `permissionLabel`, not spelled out here. It is the one
 *  place a user is told which permission to go ask an Admin for, and a hardcoded copy would
 *  drift silently the first time either half of that label is renamed. */
export function NoAssignableCargosNote() {
  return (
    <p id={NO_ASSIGNABLE_CARGOS_NOTE_ID} role="note" className="text-ui-xs text-ink-3">
      Ningún cargo del catálogo es asignable con tus permisos. Los cargos del Comité Ejecutivo Local
      y los que otorgan permisos requieren un administrador o el permiso «
      {permissionLabel("update:BoardSeat")}».
    </p>
  );
}
