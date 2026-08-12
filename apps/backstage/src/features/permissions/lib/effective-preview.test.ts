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

  it("BLOCKING: a deactivated built-in doc contributes nothing and does NOT fall back to the snapshot", () => {
    // Mirror of the beacon three-way. An inactive doc COVERS its key, so reporting
    // BUILT_IN_ROLE_PERMS here would show the admin perms the member will not get.
    const out = previewEffectivePerms({
      builtInRoleNames: ["Treasury"],
      selectedCustomRoleIds: [],
      allRoles: [
        role({
          id: "Treasury",
          builtIn: true,
          builtInKey: "Treasury",
          permissions: ["manage:all"],
          active: false,
        }),
      ],
      overrides: { grant: [], revoke: [] },
    });
    expect(out).toEqual([]);
  });

  it("a deactivated built-in does not suppress another key's snapshot fallback", () => {
    const out = previewEffectivePerms({
      builtInRoleNames: ["Treasury", "Secretary"],
      selectedCustomRoleIds: [],
      allRoles: [
        role({
          id: "Treasury",
          builtIn: true,
          builtInKey: "Treasury",
          permissions: ["manage:all"],
          active: false,
        }),
      ],
      overrides: { grant: [], revoke: [] },
    });
    expect(out).toEqual([...BUILT_IN_ROLE_PERMS.Secretary].sort());
  });

  it("BLOCKING: a deactivated CUSTOM role contributes nothing", () => {
    // members.roleIds keeps naming a deactivated custom role — softDelete never scrubs
    // roleIds — and this path had no `active` filter at all, correct only by accident
    // because the hook feeding it used to be active-only.
    const out = previewEffectivePerms({
      builtInRoleNames: [],
      selectedCustomRoleIds: ["c1"],
      allRoles: [role({ id: "c1", permissions: ["manage:Ally"], active: false })],
      overrides: { grant: [], revoke: [] },
    });
    expect(out).toEqual([]);
  });

  it("an active:true + deletedAt-set ghost contributes nothing on either path", () => {
    const deletedAt = { seconds: 1, nanoseconds: 0 } as unknown as RoleDefinition["deletedAt"];
    expect(
      previewEffectivePerms({
        builtInRoleNames: ["Treasury"],
        selectedCustomRoleIds: ["c1"],
        allRoles: [
          role({
            id: "Treasury",
            builtIn: true,
            builtInKey: "Treasury",
            permissions: ["manage:all"],
            deletedAt,
          }),
          role({ id: "c1", permissions: ["manage:Ally"], deletedAt }),
        ],
        overrides: { grant: [], revoke: [] },
      }),
    ).toEqual([]);
  });
});
