/** The blast-radius phrase both lifecycle confirmations print before writing.
 *
 *  `null` means the members query did NOT resolve — a state `/permisos` reaches on
 *  purpose: it keeps `RolesPanel` (and with it the only role-restore affordance) alive
 *  through a members outage, so `holders: []` there is "unknown", not "nobody". Printing
 *  "0 miembros activos" would assert an empty blast radius as fact right before a write
 *  that fans out through an unbounded no-retry members scan (`index.ts:298`).
 *
 *  Shared rather than inlined twice: the reactivate dialog and the editor's deactivate
 *  paragraph make the same claim, and two copies of this Spanish would drift.
 *
 *  "activos" either way — the count comes from `useMembers()`
 *  (`where('active','==',true)`) while the fan-out has no active filter, so even a known
 *  count is not the complete blast radius. */
export function holdersPhrase(count: number | null): string {
  if (count === null) return "un número desconocido de miembros activos (lista no disponible)";
  return `${count} ${count === 1 ? "miembro activo" : "miembros activos"}`;
}
