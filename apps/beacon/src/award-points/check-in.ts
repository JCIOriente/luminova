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

/** Validate a raw check-in document. Returns the typed CheckIn or null (no throw — avoids retry storms). */
export function validateCheckIn(data: unknown): CheckIn | null {
  const raw = (data ?? {}) as Record<string, unknown>;
  if (typeof raw.memberId !== "string" || raw.memberId.length === 0) return null;
  if (typeof raw.activityId !== "string" || raw.activityId.length === 0) return null;
  if (!PARTICIPATION_ROLES.includes(raw.role as ParticipationRole)) return null;
  if (!isTimestamp(raw.checkInAt)) return null;
  return {
    memberId: raw.memberId,
    activityId: raw.activityId,
    role: raw.role as ParticipationRole,
    checkInAt: raw.checkInAt,
  };
}
