import { describe, it, expect } from "vitest";
import { currentTermId } from "./current-term";

describe("currentTermId", () => {
  it("returns the calendar year of the given date as a string", () => {
    expect(currentTermId(new Date("2026-06-06T12:00:00Z"))).toBe("2026");
    expect(currentTermId(new Date("2031-12-31T23:00:00Z"))).toBe("2031");
  });

  it("defaults to the current year", () => {
    expect(currentTermId()).toBe(String(new Date().getFullYear()));
  });
});
