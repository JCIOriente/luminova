import { describe, expect, it } from "vitest";
import { buildAbility } from "@luminova/auth/ability";
import type { AuthClaims } from "@luminova/auth/roles";
import { buildCan } from "./use-can";

function can(claims: AuthClaims) {
  return buildCan(buildAbility(claims, "self"), claims);
}

describe("buildCan", () => {
  it("perm gate follows the resolved perms claim", () => {
    const gate = can({ roles: ["Membership"], perms: ["create:Member", "update:Member"] });
    expect(gate.can("create", "Member")).toBe(true);
    expect(gate.can("update", "Member")).toBe(true);
    expect(gate.can("create", "Ally")).toBe(false);
  });

  it("manage:all perm grants any subject but does NOT imply the Admin role", () => {
    const gate = can({ roles: ["Membership"], perms: ["manage:all"] });
    expect(gate.can("update", "Role")).toBe(true);
    expect(gate.isAdmin).toBe(false);
    expect(gate.hasRole(["Admin"])).toBe(false);
  });

  it("role gate reads the roles claim, independent of perms", () => {
    const gate = can({ roles: ["ExecutiveCommittee"] });
    expect(gate.hasRole(["ExecutiveCommittee"])).toBe(true);
    expect(gate.hasRole(["Admin"])).toBe(false);
    expect(gate.hasRole(["Admin", "ProjectManager"])).toBe(false);
  });

  it("Admin role resolves isAdmin", () => {
    const gate = can({ roles: ["Admin"] });
    expect(gate.isAdmin).toBe(true);
    expect(gate.hasRole(["Admin"])).toBe(true);
  });

  it("canFeatureInitiatives holds for Admin or ProjectManager only", () => {
    expect(can({ roles: ["Admin"] }).canFeatureInitiatives).toBe(true);
    expect(can({ roles: ["ProjectManager"] }).canFeatureInitiatives).toBe(true);
    expect(can({ roles: ["Membership"] }).canFeatureInitiatives).toBe(false);
  });

  // Same invariant the `<Can>` gate carries: a conditional own-doc grant answers only the
  // per-document question, never the collection one.
  it("a plain Member's own-doc grant does not answer the collection question", () => {
    const gate = can({ roles: ["Member"] });
    expect(gate.can("update", "Member")).toBe(false);
    expect(gate.can("update", "Member", { uid: "self" })).toBe(true);
    expect(gate.can("update", "Member", { uid: "other" })).toBe(false);
  });

  it("empty claims deny everything (fail-closed)", () => {
    const gate = can({ roles: [] });
    expect(gate.can("read", "Member")).toBe(false);
    expect(gate.isAdmin).toBe(false);
  });
});
