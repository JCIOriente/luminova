import { describe, it, expect } from "vitest";
import { roleDefinitionDocSchema } from "./role-definition-doc-schema";

const ts = { toMillis: () => 0, toDate: () => new Date(0) };

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

  it("rejects an unknown permission code", () => {
    const malformed = { ...validDoc, permissions: ["nope:Nope"] };
    expect(roleDefinitionDocSchema.safeParse(malformed).success).toBe(false);
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
    const parsed = roleDefinitionDocSchema.parse({ ...validDoc, deletedAt: ts });
    expect(parsed.deletedAt).toBe(ts);
  });
});
