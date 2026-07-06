import type { Activity } from "@luminova/types";
import { boliviaDayKey } from "@luminova/utils/datetime";

type WindowActivity = Pick<Activity, "startAt" | "status">;

/**
 * Client mirror of `withinCheckInWindow()` in firestore.rules: a check-in is open
 * only on the activity's own Bolivia-local day, while it is not Cancelada and its
 * parent initiative is not Finalizado. An Admin may backdate a correction, so the
 * day constraint is lifted for them — matching the rules' `checkInDayOpen()`. The
 * rule remains the authority. `parentStatus` encodes three states: `null` for a
 * parentless activity, the parent initiative's status string when known, and
 * `undefined` when the activity has a parent whose status has not resolved yet —
 * which fails closed (a gate must not show open while its inputs are unknown).
 */
export function isCheckInOpen(
  activity: WindowActivity,
  parentStatus: string | null | undefined,
  now: Date,
  isAdmin = false,
): boolean {
  if (activity.status === "Cancelada") return false;
  if (!isAdmin && boliviaDayKey(activity.startAt.toMillis()) !== boliviaDayKey(now.getTime())) {
    return false;
  }
  if (parentStatus === undefined) return false;
  if (parentStatus === "Finalizado") return false;
  return true;
}
