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
