import type { Timestamp } from "@luminova/types";

/** Bolivia is UTC-4 (no DST). Mirrors the check-in window in firestore.rules. */
export const BOLIVIA_OFFSET_MS = 4 * 60 * 60 * 1000;

// Activity instants are the input wall-clock pinned to UTC (see activity-mapper),
// so every formatter renders in UTC to show exactly what was scheduled,
// independent of the viewer's timezone.
// Marked /* @__PURE__ */ so an app tree-shakes the formatters backing functions
// it never calls (spotlight omits formatDateTime/formatDate/formatTime/
// formatDateChip → drops DATE_TIME/DATE_ONLY/TIME_ONLY). Bundlers otherwise keep
// bare `new X()` as a side effect. Formatters referenced by a called function
// (e.g. MONTH_YEAR_LONG via formatMonthYear) stay regardless.
const DATE_TIME = /* @__PURE__ */ new Intl.DateTimeFormat("es-BO", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});
const MONTH_SHORT = /* @__PURE__ */ new Intl.DateTimeFormat("es-BO", {
  month: "short",
  timeZone: "UTC",
});
const MONTH_YEAR = /* @__PURE__ */ new Intl.DateTimeFormat("es-BO", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const MONTH_YEAR_LONG = /* @__PURE__ */ new Intl.DateTimeFormat("es-BO", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const DATE_ONLY = /* @__PURE__ */ new Intl.DateTimeFormat("es-BO", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const TIME_ONLY = /* @__PURE__ */ new Intl.DateTimeFormat("es-BO", {
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

/**
 * Capitalized month + year. Defaults to short ("Jun 2026", backstage listings);
 * pass `{ month: "long" }` for the spotlight showcase ("Junio 2026").
 */
export function formatMonthYear(ts: Timestamp, opts?: { month?: "short" | "long" }): string {
  const raw = (opts?.month === "long" ? MONTH_YEAR_LONG : MONTH_YEAR).format(ts.toDate());
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

function stripDot(s: string): string {
  return s.replace(/\.$/, "");
}

/**
 * Compact scheduled month range, e.g. "May – Jun 2026" or a single "Jun 2026"
 * when start and end share a month. Reads the pinned UTC wall-clock, matching
 * the rest of the module.
 */
export function formatDateRange(start: Timestamp, end: Timestamp): string {
  const startDate = start.toDate();
  const endDate = end.toDate();
  const sameYear = startDate.getUTCFullYear() === endDate.getUTCFullYear();
  const endLabel = stripDot(MONTH_YEAR.format(endDate));
  if (sameYear) {
    const startMonth = stripDot(MONTH_SHORT.format(startDate));
    if (startDate.getUTCMonth() === endDate.getUTCMonth()) return endLabel;
    return `${startMonth} – ${endLabel}`;
  }
  const startLabel = stripDot(MONTH_YEAR.format(startDate));
  return `${startLabel} – ${endLabel}`;
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
