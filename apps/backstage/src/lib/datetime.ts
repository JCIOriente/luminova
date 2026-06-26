import type { Timestamp } from "@luminova/types";

/** Bolivia is UTC-4 (no DST). Mirrors the check-in window in firestore.rules. */
export const BOLIVIA_OFFSET_MS = 4 * 60 * 60 * 1000;

// Activity instants are the input wall-clock pinned to UTC (see activity-mapper),
// so every formatter renders in UTC to show exactly what was scheduled,
// independent of the viewer's timezone.
const DATE_TIME = new Intl.DateTimeFormat("es-BO", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});
const MONTH_SHORT = new Intl.DateTimeFormat("es-BO", { month: "short", timeZone: "UTC" });
const MONTH_YEAR = new Intl.DateTimeFormat("es", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** Calendar chip for an activity cover: 3-letter uppercase month + day-of-month. */
export function formatDateChip(ts: Timestamp): { month: string; day: string } {
  const d = ts.toDate();
  return {
    month: MONTH_SHORT.format(d).replace(/[.\s]/g, "").toUpperCase(),
    day: String(d.getUTCDate()),
  };
}

/** Full "14 jun 2026, 19:00" line for card bodies and the detail hero. */
export function formatDateTime(ts: Timestamp): string {
  return DATE_TIME.format(ts.toDate());
}

/** Capitalized "Jun 2026" for compact activity listings. */
export function formatMonthYear(ts: Timestamp): string {
  const raw = MONTH_YEAR.format(ts.toDate());
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** YYYY-MM-DD of an instant read in Bolivia local time (UTC-4). */
export function boliviaDayKey(ms: number): string {
  return new Date(ms - BOLIVIA_OFFSET_MS).toISOString().slice(0, 10);
}
