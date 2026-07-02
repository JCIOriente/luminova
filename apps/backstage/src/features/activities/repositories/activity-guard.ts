import type { ActivityCategory, InitiativeKind } from "@luminova/types";

export interface LockedFields {
  category: ActivityCategory;
  startAt: number; // millis
  parentType: InitiativeKind | null;
  parentId: string | null;
}

/** True when a locked field (category/startAt/parent) differs — disallowed once
 *  check-ins exist. Mirrors firestore.rules activityLockSafe()'s field set. */
export function lockedFieldsChanged(current: LockedFields, next: LockedFields): boolean {
  return (
    current.category !== next.category ||
    current.startAt !== next.startAt ||
    current.parentType !== next.parentType ||
    current.parentId !== next.parentId
  );
}

export class ActivityLockedError extends Error {
  constructor() {
    super("No se puede editar la fecha o categoría: ya hay registros de asistencia.");
    this.name = "ActivityLockedError";
  }
}
