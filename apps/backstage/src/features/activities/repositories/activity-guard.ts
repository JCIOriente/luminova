import {
  ACTIVITY_LOCKED_FIELDS,
  type ActivityCategory,
  type ActivityLockedField,
  type InitiativeKind,
} from "@luminova/types";

/** The locked-field values a client update carries for the pre-check. Keys are
 *  derived from the canonical `ACTIVITY_LOCKED_FIELDS` (@luminova/types) — the same
 *  set `firestore.rules` activityLockSafe() enforces — so the two cannot drift:
 *  add a field there and callers must supply it here (compile error otherwise). */
export type LockedFields = {
  category: ActivityCategory;
  startAt: number; // millis
  parentType: InitiativeKind | null;
  parentId: string | null;
  termId: string;
} & Record<ActivityLockedField, unknown>;

/** True when any locked field differs — disallowed once check-ins exist. Loops the
 *  canonical field list so a new locked field is checked automatically. */
export function lockedFieldsChanged(current: LockedFields, next: LockedFields): boolean {
  return ACTIVITY_LOCKED_FIELDS.some((field) => current[field] !== next[field]);
}

export class ActivityLockedError extends Error {
  constructor() {
    super("No se puede editar la fecha o categoría: ya hay registros de asistencia.");
    this.name = "ActivityLockedError";
  }
}
