// Run the whole suite as a non-UTC viewer (Bolivia, UTC-4). Set before any Date
// or Intl use so ICU resolves the default zone to it. Every UTC-pinned formatter
// must render the scheduled wall-clock unchanged despite this offset; the two
// spotlight formatters folded in here are the regression guard for the audit bug.
// `process` is a Node/vitest runtime global; declared locally to keep this package
// free of an @types/node dependency.
declare const process: { env: Record<string, string | undefined> };
process.env.TZ = "America/La_Paz";

import { describe, expect, it } from "vitest";
import type { Timestamp } from "@luminova/types";
import {
  BOLIVIA_OFFSET_MS,
  boliviaDayKey,
  formatDate,
  formatDateChip,
  formatDateRange,
  formatDateTime,
  formatMonthYear,
  formatTime,
  monthKeyToLabel,
  relativeTimeEs,
} from "./datetime";

// Structural Timestamp — keeps this package zero-runtime-dependency (no firebase).
function ts(iso: string): Timestamp {
  return { toDate: () => new Date(iso), toMillis: () => Date.parse(iso) };
}

const midEvening = ts("2026-06-14T19:00:00Z");

describe("formatDateChip", () => {
  it("returns an uppercase 3-letter month and the UTC day", () => {
    expect(formatDateChip(midEvening)).toEqual({ month: "JUN", day: "14" });
  });
});

describe("formatDateTime", () => {
  it("renders the scheduled wall-clock in UTC 24h, not the viewer's timezone", () => {
    const out = formatDateTime(midEvening);
    expect(out).toContain("19:00");
    expect(out).toContain("2026");
  });
});

describe("formatDate / formatTime", () => {
  it("splits the UTC instant into date-only and time-only parts", () => {
    expect(formatDate(midEvening)).toContain("2026");
    expect(formatDate(midEvening)).not.toContain("19:00");
    expect(formatTime(midEvening)).toBe("19:00");
  });
});

describe("formatMonthYear", () => {
  it("returns a capitalized short month + year read in UTC", () => {
    const out = formatMonthYear(midEvening);
    expect(out).toMatch(/^Jun/);
    expect(out).toContain("2026");
  });

  it("supports a long month name for the spotlight showcase", () => {
    expect(formatMonthYear(midEvening, { month: "long" })).toBe("Junio de 2026");
  });

  // Core bug: a date pinned at UTC midnight must NOT roll back to the prior
  // month/year for a viewer west of UTC. Without timeZone:"UTC", La Paz (UTC-4)
  // reads 2026-01-01T00:00Z as 2025-12-31 → "Diciembre 2025".
  it("does not roll a UTC-midnight boundary back a month for a non-UTC viewer", () => {
    const newYear = ts("2026-01-01T00:00:00Z");
    expect(formatMonthYear(newYear, { month: "long" })).toBe("Enero de 2026");
    expect(formatMonthYear(newYear)).toMatch(/2026$/);
  });
});

describe("formatDateRange", () => {
  // Output labels are lowercase, es-BO, dot form locale-dependent — assert the
  // collapse decision (single label vs "–" separated) and the year, not the exact
  // month spelling, so the test survives ICU month-abbreviation changes.
  it("collapses a same-month range to one label", () => {
    const out = formatDateRange(ts("2026-06-01T00:00:00Z"), ts("2026-06-20T00:00:00Z"));
    expect(out).not.toContain("–");
    expect(out).toContain("2026");
  });

  it("shows both months when the range spans two months in the same year", () => {
    const out = formatDateRange(ts("2026-05-10T00:00:00Z"), ts("2026-06-20T00:00:00Z"));
    expect(out).toContain("–");
    expect(out).toContain("2026");
  });

  it("shows both year labels when the range spans two years", () => {
    const out = formatDateRange(ts("2025-11-10T00:00:00Z"), ts("2026-02-20T00:00:00Z"));
    expect(out).toContain("–");
    expect(out).toContain("2025");
    expect(out).toContain("2026");
  });

  // Core bug: same-month/same-year collapse must use UTC getters. With local
  // getters, La Paz reads the 2026-01-01T00:00Z start as 2025-12-31 → the range
  // wrongly de-collapses (year mismatch 2025 vs 2026) and leaks a "2025" label.
  it("keeps a UTC-midnight same-month range collapsed for a non-UTC viewer", () => {
    const out = formatDateRange(ts("2026-01-01T00:00:00Z"), ts("2026-01-15T00:00:00Z"));
    expect(out).not.toContain("–");
    expect(out).toContain("2026");
    expect(out).not.toContain("2025");
  });
});

describe("boliviaDayKey", () => {
  it("rolls a late-evening Bolivia instant back to its local day", () => {
    // 2026-06-14 23:30 Bolivia == 2026-06-15 03:30 UTC; the key is the Bolivia day.
    expect(boliviaDayKey(Date.parse("2026-06-15T03:30:00Z"))).toBe("2026-06-14");
  });
  it("exposes the UTC-4 offset", () => {
    expect(BOLIVIA_OFFSET_MS).toBe(4 * 60 * 60 * 1000);
  });
});

describe("monthKeyToLabel", () => {
  it("capitalizes the 3-letter month for a YYYY-MM key", () => {
    expect(monthKeyToLabel("2026-05")).toBe("May");
    expect(monthKeyToLabel("2026-06")).toBe("Jun");
  });
});

describe("relativeTimeEs", () => {
  const now = new Date(Date.UTC(2026, 5, 14, 12, 0));
  it("returns 'Hace un momento' under a minute", () => {
    expect(relativeTimeEs(new Date(now.getTime() - 30_000), now)).toBe("Hace un momento");
  });
  it("returns hours for same-day", () => {
    expect(relativeTimeEs(new Date(now.getTime() - 2 * 3600_000), now)).toBe("Hace 2 h");
  });
  it("returns 'Ayer' for ~1 day", () => {
    expect(relativeTimeEs(new Date(now.getTime() - 26 * 3600_000), now)).toBe("Ayer");
  });
  it("returns days for older", () => {
    expect(relativeTimeEs(new Date(now.getTime() - 4 * 86400_000), now)).toBe("Hace 4 d");
  });
});
