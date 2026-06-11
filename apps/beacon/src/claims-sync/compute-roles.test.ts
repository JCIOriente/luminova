import { describe, expect, it } from "vitest";
import { computeMemberRoles } from "./compute-roles.js";

describe("computeMemberRoles", () => {
  it("always includes Member", () => {
    expect(computeMemberRoles({ trustedGrants: [], hadScanner: false })).toEqual(["Member"]);
  });
  it("unions trusted grants with Member, in ROLES order, deduped", () => {
    expect(
      computeMemberRoles({
        trustedGrants: ["Membership", "Admin", "Membership"],
        hadScanner: false,
      }),
    ).toEqual(["Admin", "Membership", "Member"]);
  });
  it("preserves Scanner when previously present", () => {
    expect(computeMemberRoles({ trustedGrants: ["Treasury"], hadScanner: true })).toEqual([
      "Treasury",
      "Scanner",
      "Member",
    ]);
  });
});
