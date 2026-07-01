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
const MONTH_YEAR = new Intl.DateTimeFormat("es-BO", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const DATE_ONLY = new Intl.DateTimeFormat("es-BO", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const TIME_ONLY = new Intl.DateTimeFormat("es-BO", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
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

/** Date only, "14 jun 2026", for detail fact rows. */
export function formatDate(ts: Timestamp): string {
  return DATE_ONLY.format(ts.toDate());
}

/** Time only, "19:00", for detail fact rows. */
export function formatTime(ts: Timestamp): string {
  return TIME_ONLY.format(ts.toDate());
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

/** Capitalized 3-letter month for a YYYY-MM key, e.g. "2026-06" → "Jun". */
export function monthKeyToLabel(monthKey: string): string {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  const raw = MONTH_SHORT.format(new Date(Date.UTC(year, month - 1, 1))).replace(/[.\s]/g, "");
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Spanish relative time for the activity feed. Coarse buckets, no external dep. */
export function relativeTimeEs(at: Date, now: Date): string {
  const min = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (min < 1) return "Hace un momento";
  if (min < 60) return `Hace ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Ayer";
  return `Hace ${days} d`;
}
