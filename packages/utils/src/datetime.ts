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
// One options literal, two zones. The pair differed ONLY in `timeZone` while listing the same
// six keys twice, so a later tweak (adding `weekday`, say) had to be applied identically to
// both with nothing enforcing it.
const DATE_TIME_FIELDS = {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
} as const;
// The ONE formatter here that is not UTC-pinned, because its input is a real instant rather
// than a wall-clock pinned to UTC. See formatInstant.
const INSTANT_DATE_TIME = /* @__PURE__ */ new Intl.DateTimeFormat("es-BO", {
  ...DATE_TIME_FIELDS,
  timeZone: "America/La_Paz",
});
const DATE_TIME = /* @__PURE__ */ new Intl.DateTimeFormat("es-BO", {
  ...DATE_TIME_FIELDS,
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
const DAY_MONTH = /* @__PURE__ */ new Intl.DateTimeFormat("es-BO", {
  day: "numeric",
  month: "short",
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

/** Full "14 jun 2026, 19:00" line for an ACTIVITY's scheduled time.
 *
 *  UTC-pinned, like every formatter above it, and only correct for a value that was PINNED to
 *  UTC on the way in — an operator types "19:00" and 19:00 is what must come back, in any
 *  viewer's zone.
 *
 *  THE RULE FOR PICKING BETWEEN THESE TWO: if the field is written with `serverTimestamp()`
 *  (or otherwise records a real moment — `request.time`, `Date.now()`), it is an INSTANT and
 *  belongs in `formatInstant`. This function would render it four hours early-to-late for a
 *  Bolivian reader, and near midnight on the wrong day. That is not hypothetical: `leads` and
 *  `notifications` both wrote `createdAt` with `serverTimestamp()` and rendered it here, and
 *  both were four hours wrong in production until they were moved.
 *
 *  Its remaining callers are activity start/end times, which are genuinely wall-clocks. */
export function formatDateTime(ts: Timestamp): string {
  return DATE_TIME.format(ts.toDate());
}

/** Full "28 sept 2026, 08:00" line for a value that is a REAL INSTANT, rendered on the
 *  Bolivian wall clock.
 *
 *  The distinction from `formatDateTime` is load-bearing, not stylistic. Everything else in
 *  this module formats a wall-clock that was pinned to UTC on the way in, so UTC is the right
 *  zone to read it back in. An invite's `expiresAt` is different in kind: it is
 *  `issuedAt + INVITE_TTL_MS`, an actual moment. Rendering that in UTC would show a Bolivian
 *  operator a deadline four hours later than the real one — and near midnight, the wrong DAY.
 *  Harmless while only a date was shown across a seven-day window; wrong once a time is shown
 *  across a two-day one.
 *
 *  `America/La_Paz` rather than subtracting BOLIVIA_OFFSET_MS by hand: the zone has no DST, so
 *  the two agree, and naming the zone keeps the intent legible. */
export function formatInstant(ts: Timestamp): string {
  return INSTANT_DATE_TIME.format(ts.toDate());
}

/** Date only, "14 jun 2026", for detail fact rows. */
export function formatDate(ts: Timestamp): string {
  return DATE_ONLY.format(ts.toDate());
}

/** Day + short month, no year, e.g. "14 jun" — for recurring dates like birthdays. */
export function formatDayMonth(ts: Timestamp): string {
  return stripDot(DAY_MONTH.format(ts.toDate()));
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

// Bolivia-local calendar parts of `now` (birthdays/anniversaries are read in the
// viewer's local day, unlike the UTC-pinned scheduled instants above).
function boliviaParts(now: Date): { year: number; month: number; day: number } {
  const b = new Date(now.getTime() - BOLIVIA_OFFSET_MS);
  return { year: b.getUTCFullYear(), month: b.getUTCMonth(), day: b.getUTCDate() };
}

/**
 * Whole days until the next month/day anniversary of a UTC-pinned date, counted
 * in Bolivia local time. 0 = the anniversary is today.
 */
export function daysUntilNextAnniversary(ts: Timestamp, now: Date): number {
  const d = ts.toDate();
  const today = boliviaParts(now);
  const todayUtc = Date.UTC(today.year, today.month, today.day);
  let next = Date.UTC(today.year, d.getUTCMonth(), d.getUTCDate());
  if (next < todayUtc) next = Date.UTC(today.year + 1, d.getUTCMonth(), d.getUTCDate());
  return Math.round((next - todayUtc) / 86_400_000);
}

/** Completed whole years from a UTC-pinned date to Bolivia-local today. */
export function fullYearsBetween(ts: Timestamp, now: Date): number {
  const d = ts.toDate();
  const today = boliviaParts(now);
  let years = today.year - d.getUTCFullYear();
  const beforeAnniversary =
    today.month < d.getUTCMonth() ||
    (today.month === d.getUTCMonth() && today.day < d.getUTCDate());
  if (beforeAnniversary) years -= 1;
  return Math.max(0, years);
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
