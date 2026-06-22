import { describe, it, expect } from "vitest";
import type { RoleDefinition } from "@luminova/types";
import { previewEffectivePerms } from "./effective-preview";

const role = (over: Partial<RoleDefinition>): RoleDefinition => ({
  id: "r",
  name: "r",
  description: "",
  builtIn: false,
  builtInKey: null,
  permissions: [],
  locked: false,
  active: true,
  deletedAt: null,
  ...over,
});

describe("previewEffectivePerms", () => {
  it("falls back to the seed snapshot for a built-in role with no live doc", () => {
    const out = previewEffectivePerms({
      builtInRoleNames: ["Treasury"],
      selectedCustomRoleIds: [],
      allRoles: [],
      overrides: { grant: [], revoke: [] },
    });
    expect(out).toEqual(["manage:Payment", "read:Member", "read:MemberPoints"]);
  });

  it("prefers a live built-in role doc over the seed snapshot", () => {
    const out = previewEffectivePerms({
      builtInRoleNames: ["Treasury"],
      selectedCustomRoleIds: [],
      allRoles: [role({ id: "Treasury", builtIn: true, builtInKey: "Treasury", permissions: ["read:Member"] })],
      overrides: { grant: [], revoke: [] },
    });
    expect(out).toEqual(["read:Member"]);
  });

  it("unions selected custom roles and applies overrides (grant then revoke)", () => {
    const out = previewEffectivePerms({
      builtInRoleNames: ["Member"],
      selectedCustomRoleIds: ["c1"],
      allRoles: [role({ id: "c1", permissions: ["manage:Ally", "read:Event"] })],
      overrides: { grant: ["manage:Project"], revoke: ["read:Event"] },
    });
    expect(out).toEqual(["manage:Ally", "manage:Project"]);
  });

  it("ignores unknown custom role ids", () => {
    const out = previewEffectivePerms({
      builtInRoleNames: ["Member"],
      selectedCustomRoleIds: ["missing"],
      allRoles: [],
      overrides: { grant: [], revoke: [] },
    });
    expect(out).toEqual([]);
  });
});
