import { describe, expect, it } from "vitest";
import { ROLES } from "@luminova/auth/roles";
import { BUILT_IN_ROLE_PERMS } from "@luminova/types/role-definition";
import { planRolePermReseed, type RoleSnapshot } from "./recompute-claims.js";

function snap(over: Partial<RoleSnapshot> & { id: string }): RoleSnapshot {
  const permissions = over.permissions ?? [];
  return {
    exists: true,
    builtInKey: over.id,
    locked: false,
    active: true,
    // Default the raw view to the sanitized one, so only a test that means to exercise a
    // malformed doc has to say so.
    rawPermissions: [...permissions],
    ...over,
    permissions,
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

  it("BLOCKING: a doc carrying an invalid code is applied, not reported unchanged", () => {
    // permsFromRoleDoc silently drops anything isValidPermissionCode rejects, so a
    // console-edited `permissions` whose junk sits alongside the right codes SANITIZES to a
    // set equal to the snapshot. Comparing on the sanitized view alone reported
    // `unchanged`, left the junk on disk forever, and made this the one case an operator
    // could not tell apart from a genuinely up-to-date doc.
    const plan = planRolePermReseed([
      snap({
        id: "Treasury",
        permissions: [...BUILT_IN_ROLE_PERMS.Treasury],
        rawPermissions: [...BUILT_IN_ROLE_PERMS.Treasury, "manage:Evrything"],
      }),
    ]);
    expect(plan.skipped).toEqual([]);
    expect(plan.applied).toEqual([
      { id: "Treasury", changedFields: ["permissions"], proposed: BUILT_IN_ROLE_PERMS.Treasury },
    ]);
  });

  it("still reports a genuinely clean, matching doc as unchanged", () => {
    // The guard above must not turn every doc into a write — that would fire onRoleWritten
    // (a full members scan) for nine roles on every re-run.
    const plan = planRolePermReseed([
      snap({
        id: "Treasury",
        permissions: [...BUILT_IN_ROLE_PERMS.Treasury],
        rawPermissions: [...BUILT_IN_ROLE_PERMS.Treasury],
      }),
    ]);
    expect(plan.applied).toEqual([]);
    expect(plan.skipped).toEqual([{ id: "Treasury", reason: "unchanged" }]);
  });

  it("skips a soft-deleted built-in rather than reviving it", () => {
    // Only reachable through a prior admin-SDK write, but an update here would resurrect a
    // role nobody is meant to hold AND fire onRoleWritten across the whole members
    // collection for it.
    const plan = planRolePermReseed([snap({ id: "Treasury", active: false })]);
    expect(plan.applied).toEqual([]);
    expect(plan.skipped).toEqual([{ id: "Treasury", reason: "inactive" }]);
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
