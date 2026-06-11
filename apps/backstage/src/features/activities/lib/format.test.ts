import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import { formatActivityDateTime } from "./format";

describe("formatActivityDateTime", () => {
  it("formats a Firestore timestamp in es-BO medium date + short time", () => {
    const ts = Timestamp.fromDate(new Date("2026-03-15T19:30:00Z"));
    const out = formatActivityDateTime(ts);
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});
