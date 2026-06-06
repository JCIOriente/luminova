import { describe, expect, it } from "vitest";
import { decodeClaims } from "./claims";

describe("decodeClaims", () => {
  it("returns empty roles for null token claims", () => {
    expect(decodeClaims(null)).toEqual({ roles: [] });
    expect(decodeClaims(undefined)).toEqual({ roles: [] });
  });

  it("keeps only valid role names", () => {
    expect(decodeClaims({ roles: ["Admin", "bogus", "Treasury"] })).toEqual({
      roles: ["Admin", "Treasury"],
    });
  });

  it("passes through scannerEventIds when present", () => {
    expect(decodeClaims({ roles: ["Scanner"], scannerEventIds: ["evt_1"] })).toEqual({
      roles: ["Scanner"],
      scannerEventIds: ["evt_1"],
    });
  });

  it("ignores a non-array roles claim", () => {
    expect(decodeClaims({ roles: "Admin" })).toEqual({ roles: [] });
  });
});
