import { describe, expect, it } from "vitest";
import { parseMember } from "./parse-member.js";

describe("parseMember", () => {
  it("passes through a well-formed member (incl. assignedBy)", () => {
    const result = parseMember({
      uid: "u1",
      positions: {
        "2026": { cargoId: "pos-pres", comisionIds: ["com-a", "com-b"], assignedBy: "admin-uid" },
      },
    });
    expect(result).toEqual({
      uid: "u1",
      positions: {
        "2026": { cargoId: "pos-pres", comisionIds: ["com-a", "com-b"], assignedBy: "admin-uid" },
      },
    });
  });

  it("drops a term whose comisionIds is not a string array", () => {
    const result = parseMember({
      uid: "u1",
      positions: {
        good: { cargoId: "p", comisionIds: ["c"] },
        bad: { cargoId: "p", comisionIds: "not-an-array" },
        alsoBad: { cargoId: "p", comisionIds: [1, 2] },
      },
    });
    expect(result.positions).toEqual({ good: { cargoId: "p", comisionIds: ["c"] } });
  });

  it("yields empty positions when positions is an array", () => {
    expect(parseMember({ uid: "u1", positions: [] }).positions).toEqual({});
    expect(parseMember({ uid: "u1", positions: ["x"] }).positions).toEqual({});
  });

  it("yields empty positions when positions is a string", () => {
    expect(parseMember({ uid: "u1", positions: "nope" }).positions).toEqual({});
  });

  it("returns undefined uid when missing or non-string", () => {
    expect(parseMember({ positions: {} }).uid).toBeUndefined();
    expect(parseMember({ uid: 42, positions: {} }).uid).toBeUndefined();
  });

  it("preserves a null cargoId", () => {
    const result = parseMember({
      uid: "u1",
      positions: { "2026": { cargoId: null, comisionIds: [] } },
    });
    expect(result.positions["2026"]).toEqual({ cargoId: null, comisionIds: [] });
  });

  it("drops a term whose cargoId is missing or non-string/non-null", () => {
    const result = parseMember({
      uid: "u1",
      positions: {
        missing: { comisionIds: [] },
        numeric: { cargoId: 7, comisionIds: [] },
      },
    });
    expect(result.positions).toEqual({});
  });

  it("handles null/undefined raw input", () => {
    expect(parseMember(null)).toEqual({ uid: undefined, positions: {} });
    expect(parseMember(undefined)).toEqual({ uid: undefined, positions: {} });
  });
});
