import { describe, expect, it } from "vitest";
import { ROLES } from "@luminova/auth/roles";
import { BUILT_IN_ROLE_PERMS, ROLE_DESCRIPTIONS } from "@luminova/types/role-definition";
import { buildBuiltInRoleDocs } from "./seed-roles.js";

describe("buildBuiltInRoleDocs", () => {
  it("produces one doc per built-in role with id = role name", () => {
    const docs = buildBuiltInRoleDocs();
    expect(docs.map((d) => d.id).sort()).toEqual([...ROLES].sort());
  });

  it("locks only the Admin role", () => {
    for (const doc of buildBuiltInRoleDocs()) {
      expect(doc.locked).toBe(doc.id === "Admin");
    }
  });

  it("seeds builtInKey + permissions from the snapshot", () => {
    for (const doc of buildBuiltInRoleDocs()) {
      expect(doc.builtIn).toBe(true);
      expect(doc.builtInKey).toBe(doc.id);
      expect(doc.permissions).toEqual(BUILT_IN_ROLE_PERMS[doc.builtInKey]);
      expect(doc.active).toBe(true);
      expect(doc.deletedAt).toBeNull();
    }
  });

  it("seeds the canonical description for every built-in role", () => {
    for (const doc of buildBuiltInRoleDocs()) {
      expect(doc.description).toBe(ROLE_DESCRIPTIONS[doc.builtInKey]);
    }
  });
});
