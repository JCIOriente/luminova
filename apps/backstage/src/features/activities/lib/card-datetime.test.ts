import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import { formatDateChip, formatCardDateTime } from "./card-datetime";

const ts = Timestamp.fromDate(new Date("2026-06-14T19:00:00Z"));

describe("formatDateChip", () => {
  it("returns an uppercase 3-letter month and the UTC day", () => {
    expect(formatDateChip(ts)).toEqual({ month: "JUN", day: "14" });
  });
});

describe("formatCardDateTime", () => {
  it("renders the scheduled wall-clock in UTC, not the viewer's timezone", () => {
    const out = formatCardDateTime(ts);
    expect(out).toContain("19:00");
    expect(out).toContain("2026");
  });
});
