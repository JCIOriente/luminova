import { describe, expect, it } from "vitest";
import { positionTitle, currentTermKey } from "./position.js";

const cargo = { title: "Presidente", titleFemale: "Presidenta" };

describe("positionTitle", () => {
  it("picks the female variant", () => {
    expect(positionTitle(cargo, "Femenino")).toBe("Presidenta");
  });
  it("picks the base variant for masculine", () => {
    expect(positionTitle(cargo, "Masculino")).toBe("Presidente");
  });
  it("falls back to base when gender is missing (legacy docs)", () => {
    expect(positionTitle(cargo, undefined)).toBe("Presidente");
  });
});

describe("currentTermKey", () => {
  it("is the calendar year", () => {
    expect(currentTermKey(new Date("2026-06-10T12:00:00Z"))).toBe("2026");
  });
});
