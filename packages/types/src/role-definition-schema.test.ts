import { describe, it, expect } from "vitest";
import { ROLE_NAME_MAX_LENGTH, roleDefinitionSchema } from "./role-definition-schema.js";

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

  it("accepts a name of exactly ROLE_NAME_MAX_LENGTH characters", () => {
    const result = roleDefinitionSchema.safeParse({
      name: "n".repeat(ROLE_NAME_MAX_LENGTH),
      description: "",
      permissions: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a name one character over ROLE_NAME_MAX_LENGTH", () => {
    // firestore.rules bounds `name.size() <= 100`, so without this the form 403s on save
    // instead of pre-validating — and a doc already over the bound (PR 1 shipped built-in
    // renaming with no upper bound) could not be edited or deactivated at all.
    const result = roleDefinitionSchema.safeParse({
      name: "n".repeat(ROLE_NAME_MAX_LENGTH + 1),
      description: "",
      permissions: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a whitespace-only name", () => {
    // Rules `size() >= 1` accepts "   " and cannot trim, so this is the client's job alone.
    // Left in, roleDisplay's `doc?.name || ROLE_LABELS[key]` reads it as truthy and renders
    // a built-in role with a blank label.
    const result = roleDefinitionSchema.safeParse({
      name: "   ",
      description: "",
      permissions: [],
    });
    expect(result.success).toBe(false);
  });

  it("trims the surrounding whitespace off a saved name", () => {
    const result = roleDefinitionSchema.safeParse({
      name: "  Coordinador  ",
      description: "",
      permissions: [],
    });
    expect(result.success && result.data.name).toBe("Coordinador");
  });

  it("measures the max AFTER trimming", () => {
    // The bound exists to satisfy the rules, which see the STORED (already trimmed) value.
    const padded = ` ${"n".repeat(ROLE_NAME_MAX_LENGTH)} `;
    expect(
      roleDefinitionSchema.safeParse({ name: padded, description: "", permissions: [] }).success,
    ).toBe(true);
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
