import { describe, expect, it } from "vitest";
import { ROLES } from "@luminova/auth/roles";
import { BUILT_IN_ROLE_PERMS } from "@luminova/types/role-definition";
import { planRolePermReseed, type RoleSnapshot } from "./recompute-claims.js";

function snap(over: Partial<RoleSnapshot> & { id: string }): RoleSnapshot {
  return {
    exists: true,
    builtInKey: over.id,
    locked: false,
    permissions: [],
    ...over,
  };
}

describe("planRolePermReseed", () => {
  it("plans an update for a built-in role whose perms drifted from the snapshot", () => {
    const plan = planRolePermReseed([snap({ id: "Treasury", permissions: ["read:Member"] })]);
    expect(plan.applied).toEqual([
      { id: "Treasury", changedFields: ["permissions"], proposed: BUILT_IN_ROLE_PERMS.Treasury },
    ]);
    expect(plan.skipped).toEqual([]);
    expect(plan.failed).toEqual([]);
  });

  it("skips a doc that already matches, ignoring order", () => {
    const plan = planRolePermReseed([
      snap({ id: "Treasury", permissions: [...BUILT_IN_ROLE_PERMS.Treasury].reverse() }),
    ]);
    expect(plan.applied).toEqual([]);
    expect(plan.skipped).toEqual([{ id: "Treasury", reason: "unchanged" }]);
  });

  it("skips a locked doc even when it drifted", () => {
    // The admin SDK bypasses the `locked` rule the client is held to, so roles/Admin must
    // be excluded EXPLICITLY, not by assumption.
    const plan = planRolePermReseed([snap({ id: "Admin", locked: true, permissions: [] })]);
    expect(plan.applied).toEqual([]);
    expect(plan.skipped).toEqual([{ id: "Admin", reason: "locked" }]);
  });

  it("skips a doc whose builtInKey does not match its id", () => {
    const plan = planRolePermReseed([snap({ id: "Secretary", builtInKey: "Membership" })]);
    expect(plan.skipped).toEqual([{ id: "Secretary", reason: "not-built-in" }]);
  });

  it("reports a missing doc as a `missing` skip, not an apply (update() would abort the batch)", () => {
    // The operator-facing half of the two-step rollout: this callable only ever UPDATES.
    // ActivityManager and Secretary have no doc in production, so a reseed alone can never
    // create them — `seedRoles` must run first, and this reason is how an operator finds
    // that out instead of watching the two new roles stay "sin sincronizar" forever.
    const plan = planRolePermReseed([snap({ id: "Secretary", exists: false })]);
    expect(plan.applied).toEqual([]);
    expect(plan.skipped).toEqual([{ id: "Secretary", reason: "missing" }]);
    expect(plan.failed).toEqual(["Secretary"]);
  });

  it("covers every ROLES key when handed a full, empty snapshot set", () => {
    const plan = planRolePermReseed(ROLES.map((id) => snap({ id, locked: id === "Admin" })));
    const touched = [...plan.applied.map((a) => a.id), ...plan.skipped.map((s) => s.id)];
    expect(touched.sort()).toEqual([...ROLES].sort());
  });

  it("stays far under the 500-write batch limit", () => {
    expect(ROLES.length).toBeLessThan(500);
  });
});
