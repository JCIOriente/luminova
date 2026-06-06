import { describe, expect, it } from "vitest";
import { ROLES, isValidRole, hasRole, hasAnyRole, type AuthClaims } from "./roles";

describe("roles", () => {
  it("lists the seven permission roles", () => {
    expect(ROLES).toEqual([
      "Admin",
      "Membership",
      "Treasury",
      "ExecutiveCommittee",
      "ProjectManager",
      "Scanner",
      "Member",
    ]);
  });

  it("validates known role names", () => {
    expect(isValidRole("Treasury")).toBe(true);
    expect(isValidRole("isCEL")).toBe(false);
    expect(isValidRole(42)).toBe(false);
  });

  it("hasRole checks a single role", () => {
    const claims: AuthClaims = { roles: ["Membership"] };
    expect(hasRole(claims, "Membership")).toBe(true);
    expect(hasRole(claims, "Admin")).toBe(false);
  });

  it("hasAnyRole checks intersection (additive roles)", () => {
    const claims: AuthClaims = { roles: ["Membership", "ExecutiveCommittee"] };
    expect(hasAnyRole(claims, ["Admin", "ExecutiveCommittee"])).toBe(true);
    expect(hasAnyRole(claims, ["Admin", "Treasury"])).toBe(false);
  });
});
