import type { Timestamp } from "@luminova/types";

// Stored instants are the input wall-clock pinned to UTC (see activity-mapper),
// so render in UTC to show exactly what was scheduled, independent of the
// viewer's timezone.
const DATE_TIME = new Intl.DateTimeFormat("es-BO", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});
const MONTH = new Intl.DateTimeFormat("es-BO", { month: "short", timeZone: "UTC" });

/** Calendar chip for an activity cover: 3-letter uppercase month + day-of-month. */
export function formatDateChip(ts: Timestamp): { month: string; day: string } {
  const d = ts.toDate();
  return {
    month: MONTH.format(d).replace(/[.\s]/g, "").toUpperCase(),
    day: String(d.getUTCDate()),
  };
}

/** Full "14 jun 2026, 19:00" line for the card body. */
export function formatCardDateTime(ts: Timestamp): string {
  return DATE_TIME.format(ts.toDate());
}
