import type { AppAbility } from "@luminova/auth/ability";
import type { ParticipationRole } from "@luminova/types/engine";
import { abilityAllows } from "../../../lib/authz/probe";

/** May the caller undo THIS roster row? Mirrors the `checkIns` delete rule
 *  (firestore.rules): a coarse `checkIn:Attendance` holder (Admin/PM/custom) may
 *  undo any row; a Scanner may undo only `Attendee` rows on its in-scope events.
 *
 *  The distinction rides CASL: the coarse grant is unconditional, so it matches an
 *  Attendance instance with no `eventId`; the Scanner grant is conditioned on
 *  `eventId ∈ scannerEventIds`, so the empty-instance check fails for a Scanner and
 *  the scoped check passes only for its own events. */
export function canRemoveEntry(
  ability: AppAbility,
  activityId: string,
  entry: { role: ParticipationRole },
): boolean {
  const isAttendanceManager = abilityAllows(ability, "checkIn", "Attendance");
  if (isAttendanceManager) return true;
  return (
    entry.role === "Attendee" &&
    abilityAllows(ability, "checkIn", "Attendance", { eventId: activityId })
  );
}
