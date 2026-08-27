/** Why the Cargo picker is empty, for an editor who is not a board-seat delegate.
 *
 *  Without it the Combobox renders its bare "Sin resultados" and the editor cannot tell a
 *  permission ceiling from an empty catalog — which is the state a chapter whose every cargo
 *  carries grants lands in permanently.
 *
 *  Shared by both member forms rather than typed into each: the `locked` and `takedownOnly`
 *  notes legitimately differ in wording between them, this one does not.
 *
 *  The quoted permission name must stay equal to `permissionLabel("update:BoardSeat")` —
 *  ACTION_LABELS.update + SUBJECT_LABELS.BoardSeat, in features/permissions. Nothing enforces
 *  the match across the two features, so it is stated here. */
export function NoAssignableCargosNote() {
  return (
    <p role="note" className="text-ui-xs text-ink-3">
      Ningún cargo del catálogo es asignable con tus permisos. Los cargos del Comité Ejecutivo Local
      y los que otorgan permisos requieren un Admin o el permiso «Editar Asientos de directiva».
    </p>
  );
}
