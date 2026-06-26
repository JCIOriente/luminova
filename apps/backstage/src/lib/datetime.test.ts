import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import {
  BOLIVIA_OFFSET_MS,
  boliviaDayKey,
  formatDateChip,
  formatDateTime,
  formatMonthYear,
} from "./datetime";

const ts = Timestamp.fromDate(new Date("2026-06-14T19:00:00Z"));

describe("formatDateChip", () => {
  it("returns an uppercase 3-letter month and the UTC day", () => {
    expect(formatDateChip(ts)).toEqual({ month: "JUN", day: "14" });
  });
});

describe("formatDateTime", () => {
  it("renders the scheduled wall-clock in UTC 24h, not the viewer's timezone", () => {
    const out = formatDateTime(ts);
    expect(out).toContain("19:00");
    expect(out).toContain("2026");
  });
});

describe("formatMonthYear", () => {
  it("returns a capitalized month + year read in UTC", () => {
    const out = formatMonthYear(ts);
    expect(out).toMatch(/^Jun/);
    expect(out).toContain("2026");
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
