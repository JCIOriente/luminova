import { describe, expect, it } from "vitest";
import { isValidRole, hasRole, hasAnyRole, type AuthClaims } from "./roles";

// The canonical ROLES catalog is derivation-guarded in packages/types
// (role-definition.test.ts: every role has a BUILT_IN_ROLE_PERMS entry). A retyped
// literal pin here would only duplicate that closed-enum change-detector in a second
// package — dropped per the 2026-07-11 test-quality audit (#11). This file keeps the
// behavioral guards (validation + role checks) whose oracles are independent.

describe("roles", () => {
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
