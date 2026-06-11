import type { Activity, ActivityInput } from "@luminova/types";

/** Map a persisted Activity to the form's input shape (datetime-local strings). */
export function activityToInput(a: Activity): Partial<ActivityInput> {
  return {
    title: a.title,
    description: a.description ?? "",
    category: a.category,
    parentType: a.parentType,
    parentId: a.parentId,
    startAt: new Date(a.startAt.toMillis()).toISOString().slice(0, 16),
    endAt: a.endAt === null ? null : new Date(a.endAt.toMillis()).toISOString().slice(0, 16),
    directorId: a.organizers.directorId,
    coDirectorIds: a.organizers.coDirectorIds,
  };
}
