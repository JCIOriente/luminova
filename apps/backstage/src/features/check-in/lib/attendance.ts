/**
 * Default per-activity capacity: the number of members JCI Oriente has declared
 * to JCI Bolivia. Used as the attendance denominator until per-activity capacity
 * (and public sign-up) lands in a later iteration.
 */
const DEFAULT_ACTIVITY_CAPACITY = 30;

export interface Attendance {
  present: number;
  capacity: number;
  /** 0–100, clamped (a busier-than-capacity event never exceeds 100%). */
  pct: number;
  /** Seats still open, floored at 0. */
  remaining: number;
}

export function computeAttendance(
  present: number,
  capacity: number = DEFAULT_ACTIVITY_CAPACITY,
): Attendance {
  const safeCapacity = capacity > 0 ? capacity : DEFAULT_ACTIVITY_CAPACITY;
  const pct = Math.min(100, Math.round((present / safeCapacity) * 100));
  const remaining = Math.max(0, safeCapacity - present);
  return { present, capacity: safeCapacity, pct, remaining };
}
