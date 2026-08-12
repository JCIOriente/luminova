import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { deleteApp } from "firebase-admin/app";
import { ROLES } from "@luminova/auth/roles";
import { BUILT_IN_ROLE_PERMS } from "@luminova/types/role-definition";
import { clearCollections, initEmulatorTestApp } from "./award-points/emulator-harness.js";
import { seedBuiltInRoles } from "./seed-roles.js";

// buildBuiltInRoleDocs is covered purely by seed-roles.test.ts. THIS suite exercises
// the create()-only write path against the real emulator — specifically that it never
// clobbers or resurrects an existing doc.

const { app, db } = initEmulatorTestApp();
const DELETED_AT = new Date("2026-01-01T00:00:00Z");

beforeEach(async () => {
  await clearCollections(db, ["roles"]);
});
afterAll(async () => {
  await deleteApp(app);
});

describe("seedBuiltInRoles (emulator)", () => {
  it("creates one doc per ROLES key on a fresh project", async () => {
    const created = await seedBuiltInRoles(db);
    expect(created.sort()).toEqual([...ROLES].sort());
  });

  it("BLOCKING: does not resurrect a deactivated built-in role", async () => {
    await seedBuiltInRoles(db);
    await db.doc("roles/Treasury").update({
      permissions: ["read:Member"],
      active: false,
      deletedAt: DELETED_AT,
    });

    const created = await seedBuiltInRoles(db);

    expect(created).toEqual([]);
    const after = await db.doc("roles/Treasury").get();
    expect(after.get("active")).toBe(false);
    expect(after.get("deletedAt")).not.toBeNull();
    // Not the snapshot: create() swallowing ALREADY_EXISTS is what keeps the
    // operator's edits — and the deactivation — intact.
    expect(after.get("permissions")).toEqual(["read:Member"]);
    expect(after.get("permissions")).not.toEqual(BUILT_IN_ROLE_PERMS.Treasury);
  });
});
