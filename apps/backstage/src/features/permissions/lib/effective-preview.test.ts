import { describe, it, expect } from "vitest";
import { BUILT_IN_ROLE_PERMS, type RoleDefinition } from "@luminova/types";
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
    // Assert the contract — falls back to the canonical seed snapshot — not a hand copy
    // of its values, so a Treasury perms change surfaces as intent, not a stale mismatch.
    expect(out).toEqual(BUILT_IN_ROLE_PERMS.Treasury);
  });

  it("prefers a live built-in role doc over the seed snapshot", () => {
    const out = previewEffectivePerms({
      builtInRoleNames: ["Treasury"],
      selectedCustomRoleIds: [],
      allRoles: [
        role({
          id: "Treasury",
          builtIn: true,
          builtInKey: "Treasury",
          permissions: ["read:Member"],
        }),
      ],
      overrides: { grant: [], revoke: [] },
    });
    expect(out).toEqual(["read:Member"]);
  });

  it("unions selected custom roles and applies overrides (grant then revoke)", () => {
    const out = previewEffectivePerms({
      builtInRoleNames: [],
      selectedCustomRoleIds: ["c1"],
      allRoles: [role({ id: "c1", permissions: ["manage:Ally", "read:Position"] })],
      overrides: { grant: ["manage:Project"], revoke: ["read:Position"] },
    });
    expect(out).toEqual(["manage:Ally", "manage:Project"]);
  });

  it("ignores unknown custom role ids", () => {
    const out = previewEffectivePerms({
      builtInRoleNames: [],
      selectedCustomRoleIds: ["missing"],
      allRoles: [],
      overrides: { grant: [], revoke: [] },
    });
    expect(out).toEqual([]);
  });
});
