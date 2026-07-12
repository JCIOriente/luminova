import { describe, expect, it } from "vitest";
import { computeAttendance } from "./attendance";

describe("computeAttendance", () => {
  it("defaults capacity to 30", () => {
    // Behavioral oracle (not a constant echo): the default flows through computeAttendance.
    expect(computeAttendance(0).capacity).toBe(30);
  });

  it("computes percentage and remaining seats", () => {
    expect(computeAttendance(6)).toEqual({ present: 6, capacity: 30, pct: 20, remaining: 24 });
  });

  it("clamps a full/over-capacity event to 100% and 0 remaining", () => {
    expect(computeAttendance(35, 30)).toMatchObject({ pct: 100, remaining: 0 });
  });

  it("falls back to the default when capacity is non-positive", () => {
    expect(computeAttendance(3, 0).capacity).toBe(30);
  });
});
