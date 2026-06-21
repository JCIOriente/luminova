import { describe, it, expect } from "vitest";
import { roleDefinitionSchema } from "./role-definition-schema.js";

describe("roleDefinitionSchema", () => {
  it("accepts a valid custom role", () => {
    const result = roleDefinitionSchema.safeParse({
      name: "Coordinador de Eventos",
      description: "",
      permissions: ["manage:Event"],
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
});
