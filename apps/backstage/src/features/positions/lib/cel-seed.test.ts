import { describe, expect, it } from "vitest";
import { CEL_SEED } from "./cel-seed";

describe("CEL_SEED", () => {
  it("has the 8 fixed cargos, all CEL and evergreen", () => {
    expect(CEL_SEED).toHaveLength(8);
    expect(CEL_SEED.every((p) => p.category === "CEL" && p.term === null)).toBe(true);
  });
  it("has unique titles and both gender variants everywhere", () => {
    expect(new Set(CEL_SEED.map((p) => p.title)).size).toBe(8);
    expect(CEL_SEED.every((p) => p.title.length >= 3 && p.titleFemale.length >= 3)).toBe(true);
  });
  it("maps Presidente to Admin and Tesorero to Treasury", () => {
    expect(CEL_SEED.find((p) => p.title === "Presidente")?.grants).toEqual(["Admin"]);
    expect(CEL_SEED.find((p) => p.title === "Tesorero")?.grants).toEqual(["Treasury"]);
  });
});
