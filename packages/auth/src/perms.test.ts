import { describe, it, expect } from "vitest";
import { resolveEffectivePerms } from "./perms.js";
import type { RoleDefinition } from "@luminova/types";

const role = (permissions: string[]): RoleDefinition => ({
  id: "r",
  name: "r",
  description: "",
  builtIn: false,
  builtInKey: null,
  permissions: permissions as RoleDefinition["permissions"],
  locked: false,
  active: true,
  deletedAt: null,
});

describe("resolveEffectivePerms", () => {
  it("unions role perms and dedupes + sorts", () => {
    const out = resolveEffectivePerms({
      roleDocs: [role(["read:Member"]), role(["read:Member", "manage:Ally"])],
    });
    expect(out).toEqual(["manage:Ally", "read:Member"]);
  });

  it("applies grants then revokes", () => {
    const out = resolveEffectivePerms({
      roleDocs: [role(["read:Member"])],
      overrides: { grant: ["manage:Event"], revoke: ["read:Member"] },
    });
    expect(out).toEqual(["manage:Event"]);
  });

  it("revoke wins over grant for the same code", () => {
    const out = resolveEffectivePerms({
      roleDocs: [],
      overrides: { grant: ["read:Member"], revoke: ["read:Member"] },
    });
    expect(out).toEqual([]);
  });

  it("returns empty for no roles and no overrides", () => {
    expect(resolveEffectivePerms({ roleDocs: [] })).toEqual([]);
  });
});
