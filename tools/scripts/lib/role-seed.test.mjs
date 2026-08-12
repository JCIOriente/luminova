import { test } from "node:test";
import assert from "node:assert/strict";
import { permsForRoles, buildBuiltInRoleDocs, BUILT_IN_ROLE_PERMS } from "./role-seed.mjs";

// Behavioral tests only. The drift guard that this mirror's BUILT_IN_ROLE_PERMS +
// ROLE_LABELS match the canonical @luminova/types source lives in
// packages/types/src/role-definition.mirror.test.ts (a vitest that CAN import the
// workspace package; this plain-Node runner cannot).

test("permsForRoles unions, dedupes, and sorts", () => {
  assert.deepEqual(permsForRoles(["Member", "Admin"]), [
    "manage:all",
    "read:Activity",
    "read:Member",
    "read:MemberPoints",
    "read:Program",
    "read:Project",
  ]);
  assert.deepEqual(permsForRoles(["Member"]), [
    "read:Activity",
    "read:Member",
    "read:MemberPoints",
    "read:Program",
    "read:Project",
  ]);
  assert.deepEqual(permsForRoles(["Admin", "Admin"]), ["manage:all"]);
  assert.deepEqual(permsForRoles(["Treasury"]), ["read:Member", "read:MemberPoints"]);
});

test("buildBuiltInRoleDocs emits one doc per built-in role; only Admin is locked", () => {
  const docs = buildBuiltInRoleDocs();
  // Derived, not a hardcoded count: a role added to the table must get a seed doc, and the
  // literal 7 silently stopped covering the table when it grew to nine keys.
  assert.equal(docs.length, Object.keys(BUILT_IN_ROLE_PERMS).length);
  assert.deepEqual(docs.map((d) => d.id).sort(), Object.keys(BUILT_IN_ROLE_PERMS).sort());
  const admin = docs.find((d) => d.id === "Admin");
  assert.equal(admin.locked, true);
  assert.equal(admin.builtIn, true);
  assert.equal(admin.builtInKey, "Admin");
  assert.deepEqual(admin.permissions, ["manage:all"]);
  assert.equal(admin.deletedAt, null);
  for (const d of docs) if (d.id !== "Admin") assert.equal(d.locked, false);
});
