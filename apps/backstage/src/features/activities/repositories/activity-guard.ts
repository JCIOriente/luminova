import type { ActivityCategory } from "@luminova/types";

export interface LockedFields {
  category: ActivityCategory;
  startAt: number; // millis
}

/** True when a locked field (category/startAt) differs — disallowed once check-ins exist. */
export function lockedFieldsChanged(current: LockedFields, next: LockedFields): boolean {
  return current.category !== next.category || current.startAt !== next.startAt;
}

export class ActivityLockedError extends Error {
  constructor() {
    super("No se puede editar la fecha o categoría: ya hay registros de asistencia.");
    this.name = "ActivityLockedError";
  }
}
