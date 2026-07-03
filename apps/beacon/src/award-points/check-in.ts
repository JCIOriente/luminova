import { PARTICIPATION_ROLES, type ParticipationRole } from "@luminova/types/engine";
import type { CheckIn } from "@luminova/types/engine";
import { isCleanId } from "./ids.js";

export type { CheckIn };

function isTimestamp(value: unknown): value is CheckIn["checkInAt"] {
  return typeof (value as { toMillis?: unknown })?.toMillis === "function";
}

/** Identity fields drive the deterministic participation id — a change means the
 *  old derived row no longer belongs to this doc. */
export function checkInIdentityChanged(a: CheckIn, b: CheckIn): boolean {
  return a.memberId !== b.memberId || a.activityId !== b.activityId || a.role !== b.role;
}

/** Clean activityIds referenced by either side of a checkIns write, deduped —
 *  every one needs its hasCheckIns flag re-synced (an identity move drains the
 *  old activity's count too). Malformed docs still contribute their activityId,
 *  matching the count query the flag recomputes from. */
export function checkInActivityIds(beforeRaw: unknown, afterRaw: unknown): string[] {
  const ids = new Set<string>();
  for (const raw of [beforeRaw, afterRaw]) {
    const activityId = ((raw ?? {}) as { activityId?: unknown }).activityId;
    if (isCleanId(activityId)) ids.add(activityId);
  }
  return [...ids];
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
