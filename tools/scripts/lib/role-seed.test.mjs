import { test } from "node:test";
import assert from "node:assert/strict";
import { permsForRoles, buildBuiltInRoleDocs } from "./role-seed.mjs";

// Behavioral tests only. The drift guard that this mirror's BUILT_IN_ROLE_PERMS +
// ROLE_LABELS match the canonical @luminova/types source lives in
// packages/types/src/role-definition.mirror.test.ts (a vitest that CAN import the
// workspace package; this plain-Node runner cannot).

test("permsForRoles unions, dedupes, and sorts", () => {
  assert.deepEqual(permsForRoles(["Member", "Admin"]), [
    "manage:all",
    "read:Activity",
    "read:Member",
    "read:Program",
  ]);
  assert.deepEqual(permsForRoles(["Member"]), ["read:Activity", "read:Member", "read:Program"]);
  assert.deepEqual(permsForRoles(["Admin", "Admin"]), ["manage:all"]);
  assert.deepEqual(permsForRoles(["Treasury"]), ["read:Member", "read:MemberPoints"]);
});

test("buildBuiltInRoleDocs emits 7 docs; only Admin is locked", () => {
  const docs = buildBuiltInRoleDocs();
  assert.equal(docs.length, 7);
  const admin = docs.find((d) => d.id === "Admin");
  assert.equal(admin.locked, true);
  assert.equal(admin.builtIn, true);
  assert.equal(admin.builtInKey, "Admin");
  assert.deepEqual(admin.permissions, ["manage:all"]);
  assert.equal(admin.deletedAt, null);
  for (const d of docs) if (d.id !== "Admin") assert.equal(d.locked, false);
});
