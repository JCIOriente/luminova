import { test } from "node:test";
import assert from "node:assert/strict";
import { CEL_SEED } from "./cel-seed.mjs";
import {
  findPresidentPositionId,
  presidentClaims,
  buildPresidentMember,
} from "./seed-president.mjs";

test("CEL mirror has exactly one Admin-granting Presidente", () => {
  const admins = CEL_SEED.filter((p) => p.grants.includes("Admin"));
  assert.equal(admins.length, 1);
  assert.equal(admins[0].title, "Presidente");
});

test("findPresidentPositionId returns the active CEL position granting Admin", () => {
  const positions = [
    { id: "x", category: "CEL", grants: ["Membership"], active: true },
    { id: "pres", category: "CEL", grants: ["Admin"], active: true },
    { id: "old", category: "CEL", grants: ["Admin"], active: false },
  ];
  assert.equal(findPresidentPositionId(positions), "pres");
});

test("findPresidentPositionId throws when no active CEL grants Admin", () => {
  assert.throws(
    () =>
      findPresidentPositionId([{ id: "a", category: "CEL", grants: ["Treasury"], active: true }]),
    /grants Admin/,
  );
});

test("presidentClaims includes Member and Admin", () => {
  assert.deepEqual(presidentClaims(), { roles: ["Member", "Admin"] });
});

test("buildPresidentMember self-assigns the cargo for the term", () => {
  const m = buildPresidentMember({
    uid: "u1",
    name: "Ana",
    email: "a@jci.cc",
    gender: "Femenino",
    term: "2026",
    cargoId: "pres",
    joinDate: "JD",
    birthdate: "BD",
  });
  assert.equal(m.uid, "u1");
  assert.equal(m.status, "Activo");
  assert.equal(m.active, true);
  assert.equal(m.deletedAt, null);
  assert.equal(m.joinDate, "JD");
  assert.deepEqual(m.positions, {
    2026: { cargoId: "pres", comisionIds: [], assignedBy: "u1" },
  });
});
