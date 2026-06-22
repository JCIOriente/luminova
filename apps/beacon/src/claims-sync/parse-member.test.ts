import { describe, expect, it } from "vitest";
import { parseMember } from "./parse-member.js";

describe("parseMember", () => {
  const NO_GRANTS = { grant: [], revoke: [] };

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
      roleIds: [],
      permissionOverrides: NO_GRANTS,
    });
  });

  it("extracts roleIds and filters override codes to the known vocabulary", () => {
    const result = parseMember({
      uid: "u1",
      positions: {},
      roleIds: ["custom-1", "custom-2"],
      permissionOverrides: { grant: ["manage:Event", "bogus:Code"], revoke: ["read:Member"] },
    });
    expect(result.roleIds).toEqual(["custom-1", "custom-2"]);
    expect(result.permissionOverrides).toEqual({
      grant: ["manage:Event"],
      revoke: ["read:Member"],
    });
  });

  it("defaults roleIds to [] and overrides to empty when absent or malformed", () => {
    expect(parseMember({ uid: "u1", positions: {}, roleIds: "nope" }).roleIds).toEqual([]);
    expect(parseMember({ uid: "u1", positions: {} }).permissionOverrides).toEqual(NO_GRANTS);
    expect(
      parseMember({ uid: "u1", positions: {}, permissionOverrides: { grant: "x" } })
        .permissionOverrides,
    ).toEqual(NO_GRANTS);
  });

  it("drops a term whose comisionIds is present but not a string array", () => {
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

  it("defaults an absent comisionIds to [] when cargoId is valid", () => {
    const result = parseMember({
      uid: "u1",
      positions: {
        "2026": { cargoId: "pos-pres", assignedBy: "admin-uid" },
        nullCargo: { cargoId: null },
      },
    });
    expect(result.positions["2026"]).toEqual({
      cargoId: "pos-pres",
      comisionIds: [],
      assignedBy: "admin-uid",
    });
    expect(result.positions.nullCargo).toEqual({ cargoId: null, comisionIds: [] });
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
    const empty = { uid: undefined, positions: {}, roleIds: [], permissionOverrides: NO_GRANTS };
    expect(parseMember(null)).toEqual(empty);
    expect(parseMember(undefined)).toEqual(empty);
  });
});
