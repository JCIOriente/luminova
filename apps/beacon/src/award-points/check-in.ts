import { PARTICIPATION_ROLES, type ParticipationRole } from "@luminova/types/engine";
import type { CheckIn } from "@luminova/types/engine";
import { isCleanId } from "./ids.js";

export type { CheckIn };

function isTimestamp(value: unknown): value is CheckIn["checkInAt"] {
  return typeof (value as { toMillis?: unknown })?.toMillis === "function";
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
