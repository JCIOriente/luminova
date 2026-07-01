/**
 * UTC `YYYY-MM` for epoch millis — the single source of truth for month
 * bucketing. The engine writes `memberPoints.byMonth` with this key and the
 * backstage dashboard reads with the same one, so the two can never drift.
 */
export function monthBucketFromMillis(ms: number): string {
  const date = new Date(ms);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}
