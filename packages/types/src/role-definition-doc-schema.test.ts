import { describe, it, expect } from "vitest";
import { roleDefinitionDocSchema } from "./role-definition-doc-schema";
import { fakeTimestamp } from "./doc-schema-test-helpers.js";

const validDoc = {
  name: "Administrador",
  description: "Acceso total al sistema.",
  builtIn: true,
  builtInKey: "Admin",
  permissions: ["manage:all"],
  locked: true,
  active: true,
  deletedAt: null,
};

describe("roleDefinitionDocSchema", () => {
  it("parses a fully-valid doc and round-trips its fields", () => {
    const parsed = roleDefinitionDocSchema.parse(validDoc);
    expect(parsed).toEqual(validDoc);
  });

  it("rejects a malformed doc (deletedAt as ISO string instead of Timestamp)", () => {
    const malformed = { ...validDoc, deletedAt: "2024-01-01" };
    expect(roleDefinitionDocSchema.safeParse(malformed).success).toBe(false);
  });

  it("rejects an unknown builtInKey", () => {
    const malformed = { ...validDoc, builtInKey: "NotARole" };
    expect(roleDefinitionDocSchema.safeParse(malformed).success).toBe(false);
  });

  it("drops unknown/dropped permission codes on read and keeps the valid ones", () => {
    // A role doc seeded before the `Event` subject was dropped still lists it; the
    // whole doc must still parse (one dead code must not blank the roles UI).
    const legacy = { ...validDoc, permissions: ["read:Member", "manage:Event", "nope:Nope"] };
    const parsed = roleDefinitionDocSchema.parse(legacy);
    expect(parsed.permissions).toEqual(["read:Member"]);
  });

  it("drops a non-STRING permissions element instead of rejecting the whole doc", () => {
    // The ghost that closes: firestore.rules can only assert `permissions is list` (no
    // element-wise quantifier), so `['manage:all', 0]` is an ALLOWED write. Rejecting the
    // doc here dropped it client-side while beacon's permsFromRoleDoc filtered and still
    // minted `manage:all` — /permisos then showed the SEED perms and offered no editor.
    const junk = { ...validDoc, permissions: ["manage:all", 0, null, {}, ["manage:all"]] };
    const parsed = roleDefinitionDocSchema.parse(junk);
    expect(parsed.permissions).toEqual(["manage:all"]);
  });

  it("parses a doc whose permissions is entirely non-string junk down to an empty set", () => {
    const parsed = roleDefinitionDocSchema.parse({ ...validDoc, permissions: [0, false] });
    expect(parsed.permissions).toEqual([]);
  });

  it("still rejects a permissions field that is not a list at all", () => {
    // `permissions is list` IS checkable in rules, so this stays a rejection: the two
    // readers agree, and beacon's rawPermsFromRoleDoc returns [] for a non-array.
    expect(
      roleDefinitionDocSchema.safeParse({ ...validDoc, permissions: "manage:all" }).success,
    ).toBe(false);
  });

  it("accepts a custom role with builtInKey null", () => {
    const custom = { ...validDoc, builtIn: false, builtInKey: null, locked: false };
    expect(roleDefinitionDocSchema.safeParse(custom).success).toBe(true);
  });

  it("does not cap the number of permissions (write-side rule only)", () => {
    const many = {
      ...validDoc,
      permissions: Array.from({ length: 40 }, () => "manage:all" as const),
    };
    expect(roleDefinitionDocSchema.safeParse(many).success).toBe(true);
  });

  it("strips unknown extra fields", () => {
    const parsed = roleDefinitionDocSchema.parse({ ...validDoc, legacyField: "gone" });
    expect(parsed).not.toHaveProperty("legacyField");
  });

  it("accepts deletedAt as a real Timestamp-like value", () => {
    const parsed = roleDefinitionDocSchema.parse({ ...validDoc, deletedAt: fakeTimestamp });
    expect(parsed.deletedAt).toBe(fakeTimestamp);
  });
});
