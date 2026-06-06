import type { Timestamp } from "firebase-admin/firestore";
import { PARTICIPATION_ROLES, type ParticipationRole } from "@luminova/types/engine";

export interface CheckIn {
  memberId: string;
  activityId: string;
  role: ParticipationRole;
  checkInAt: Timestamp;
}

function isTimestamp(value: unknown): value is Timestamp {
  return typeof (value as { toMillis?: unknown })?.toMillis === "function";
}

/** Ids flow into composite doc ids (`activityId__memberId__role`); `/` and `__` would
 *  traverse paths or collide ids, so reject them. */
function isCleanId(value: unknown): value is string {
  return (
    typeof value === "string" && value.length > 0 && !value.includes("/") && !value.includes("__")
  );
}

/** Validate a raw check-in document. Returns the typed CheckIn or null (no throw — avoids retry storms). */
export function validateCheckIn(data: unknown): CheckIn | null {
  const raw = (data ?? {}) as Record<string, unknown>;
  if (!isCleanId(raw.memberId)) return null;
  if (!isCleanId(raw.activityId)) return null;
  if (!PARTICIPATION_ROLES.includes(raw.role as ParticipationRole)) return null;
  if (!isTimestamp(raw.checkInAt)) return null;
  return {
    memberId: raw.memberId,
    activityId: raw.activityId,
    role: raw.role as ParticipationRole,
    checkInAt: raw.checkInAt,
  };
}
