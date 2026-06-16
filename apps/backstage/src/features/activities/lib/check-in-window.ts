import type { Activity } from "@luminova/types";

/** Bolivia is UTC-4 (no DST). Mirrors the firestore.rules check-in window. */
const BOLIVIA_OFFSET_MS = 4 * 60 * 60 * 1000;

function boliviaDayKey(ms: number): string {
  return new Date(ms - BOLIVIA_OFFSET_MS).toISOString().slice(0, 10);
}

type WindowActivity = Pick<Activity, "startAt" | "status">;

/**
 * Client mirror of `withinCheckInWindow()` in firestore.rules: a check-in is open
 * only on the activity's own Bolivia-local day, while it is not Cancelada and its
 * parent initiative is not Finalizado. An Admin may backdate a correction, so the
 * day constraint is lifted for them — matching the rules' `checkInDayOpen()`. The
 * rule remains the authority. `parentStatus` is the parent initiative's status, or
 * null for a parentless activity.
 */
export function isCheckInOpen(
  activity: WindowActivity,
  parentStatus: string | null,
  now: Date,
  isAdmin = false,
): boolean {
  if (activity.status === "Cancelada") return false;
  if (!isAdmin && boliviaDayKey(activity.startAt.toMillis()) !== boliviaDayKey(now.getTime())) {
    return false;
  }
  if (parentStatus === "Finalizado") return false;
  return true;
}
