import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BUILT_IN_ROLE_PERMS,
  ROLE_LABELS,
  permsForRoles,
  buildBuiltInRoleDocs,
} from "./role-seed.mjs";

const ROLES = [
  "Admin",
  "Membership",
  "Treasury",
  "ExecutiveCommittee",
  "ProjectManager",
  "Scanner",
  "Member",
];

// Snapshot the mirror against packages/types/src/role-definition.ts. Plain-Node can't
// import the workspace package, so this guards drift by asserting the known shape — a
// change to role-definition.ts must be reflected here or this test fails.
test("BUILT_IN_ROLE_PERMS mirrors role-definition.ts", () => {
  assert.deepEqual(BUILT_IN_ROLE_PERMS.Admin, ["manage:all"]);
  assert.deepEqual(BUILT_IN_ROLE_PERMS.Scanner, []);
  assert.deepEqual(BUILT_IN_ROLE_PERMS.Member, []);
  for (const role of ROLES) {
    assert.ok(Array.isArray(BUILT_IN_ROLE_PERMS[role]), `${role} has a perms array`);
    assert.equal(typeof ROLE_LABELS[role], "string", `${role} has a label`);
  }
});

test("permsForRoles unions, dedupes, and sorts", () => {
  assert.deepEqual(permsForRoles(["Member", "Admin"]), ["manage:all"]);
  assert.deepEqual(permsForRoles(["Member"]), []);
  assert.deepEqual(permsForRoles(["Admin", "Admin"]), ["manage:all"]);
  assert.deepEqual(permsForRoles(["Treasury"]), [
    "manage:Payment",
    "read:Member",
    "read:MemberPoints",
  ]);
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
