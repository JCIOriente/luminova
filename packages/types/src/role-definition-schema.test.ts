import { describe, it, expect } from "vitest";
import { roleDefinitionSchema } from "./role-definition-schema.js";

describe("roleDefinitionSchema", () => {
  it("accepts a valid custom role", () => {
    const result = roleDefinitionSchema.safeParse({
      name: "Coordinador de Actividades",
      description: "",
      permissions: ["manage:Activity"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown permission code", () => {
    const result = roleDefinitionSchema.safeParse({
      name: "X",
      description: "",
      permissions: ["manage:Nope"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty name", () => {
    const result = roleDefinitionSchema.safeParse({ name: "", description: "", permissions: [] });
    expect(result.success).toBe(false);
  });

  it("rejects more than PERMISSION_CAP perms", () => {
    const tooMany = Array.from({ length: 31 }, () => "read:Member");
    const result = roleDefinitionSchema.safeParse({
      name: "X",
      description: "",
      permissions: tooMany,
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate permission codes (so the cap can't be gamed)", () => {
    const result = roleDefinitionSchema.safeParse({
      name: "X",
      description: "",
      permissions: ["read:Member", "read:Member"],
    });
    expect(result.success).toBe(false);
  });
});
