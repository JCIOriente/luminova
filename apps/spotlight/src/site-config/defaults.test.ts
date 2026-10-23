import { describe, expect, it } from "vitest";
import { foundedYear } from "virtual:luminova-brand";
import { currentYearsActive } from "./defaults";

describe("site config defaults", () => {
  it("count the years active from the profile's founding year", () => {
    expect(currentYearsActive(new Date(2030, 5, 1))).toBe(2030 - foundedYear);
  });
});
