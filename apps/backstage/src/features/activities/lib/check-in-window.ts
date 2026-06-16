import type { Activity } from "@luminova/types";

/** Bolivia is UTC-4 (no DST). Mirrors the firestore.rules check-in window. */
const BOLIVIA_OFFSET_MS = 4 * 60 * 60 * 1000;

function boliviaDayKey(ms: number): string {
  return new Date(ms - BOLIVIA_OFFSET_MS).toISOString().slice(0, 10);
}

type WindowActivity = Pick<Activity, "startAt" | "status" | "parentId">;

/**
 * Client mirror of `withinCheckInWindow()` in firestore.rules: a check-in is open
 * only on the activity's own Bolivia-local day, while it is not Cancelada and its
 * parent initiative is not Finalizado. The rule remains the authority.
 */
export function isCheckInOpen(
  activity: WindowActivity,
  parentStatusById: Record<string, string>,
  now: Date,
): boolean {
  if (activity.status === "Cancelada") return false;
  if (boliviaDayKey(activity.startAt.toMillis()) !== boliviaDayKey(now.getTime())) return false;
  if (activity.parentId !== null && parentStatusById[activity.parentId] === "Finalizado") {
    return false;
  }
  return true;
}
