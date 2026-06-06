import type { Participation } from "@luminova/types/engine";

/** Newest month first, then highest computedPoints within a month. */
export function byMonthThenPoints(a: Participation, b: Participation): number {
  if (a.monthBucket !== b.monthBucket) return a.monthBucket < b.monthBucket ? 1 : -1;
  return b.computedPoints - a.computedPoints;
}
