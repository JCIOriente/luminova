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

  it("decodes a valid perms claim, filtering unknown codes", () => {
    expect(
      decodeClaims({ roles: ["Member"], perms: ["manage:Ally", "bogus:Code", "read:Member"] }),
    ).toEqual({
      roles: ["Member"],
      perms: ["manage:Ally", "read:Member"],
    });
  });

  it("preserves an empty perms array (backfilled-empty is authoritative, not absent)", () => {
    expect(decodeClaims({ roles: ["Membership"], perms: [] })).toEqual({
      roles: ["Membership"],
      perms: [],
    });
  });

  it("omits perms entirely when the claim is absent or non-array (→ zero coarse abilities)", () => {
    expect(decodeClaims({ roles: ["Membership"] })).toEqual({ roles: ["Membership"] });
    expect(decodeClaims({ roles: ["Membership"], perms: "manage:all" })).toEqual({
      roles: ["Membership"],
    });
  });
});
