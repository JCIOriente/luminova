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

// Structural stand-in for a firebase Timestamp — isLiveRole only tests null-ness, and the
// real class would drag the firestore SDK into a pure unit test. Paired with every
// `active: false` below because roleLifecycleSafe() in firestore.rules now REQUIRES
// `deletedAt is timestamp` whenever active is false: `active: false, deletedAt: null` is a
// shape production can no longer hold.
const DELETED_AT = { seconds: 1, nanoseconds: 0 } as unknown as RoleDefinition["deletedAt"];

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
          deletedAt: DELETED_AT,
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
          deletedAt: DELETED_AT,
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
      allRoles: [
        role({ id: "c1", permissions: ["manage:Ally"], active: false, deletedAt: DELETED_AT }),
      ],
      overrides: { grant: [], revoke: [] },
    });
    expect(out).toEqual([]);
  });

  it.each([
    ["live doc first", (live: RoleDefinition, dead: RoleDefinition) => [live, dead]],
    ["inactive doc first", (live: RoleDefinition, dead: RoleDefinition) => [dead, live]],
  ])("BLOCKING: unions the live docs when two docs claim one builtInKey (%s)", (_name, order) => {
    // A Map keyed by builtInKey made this LAST-WINS and therefore order-dependent:
    // the same two docs previewed as ["read:Member"] or [] depending on the sort.
    // Beacon computes coverage over every returned doc and unions the live ones
    // (resolve-member-perms.ts), so the preview an Admin authorizes from must too.
    const live = role({
      id: "t_live",
      builtIn: true,
      builtInKey: "Treasury",
      permissions: ["read:Member"],
    });
    const dead = role({
      id: "t_dead",
      builtIn: true,
      builtInKey: "Treasury",
      permissions: ["manage:all"],
      active: false,
      deletedAt: DELETED_AT,
    });
    const out = previewEffectivePerms({
      builtInRoleNames: ["Treasury"],
      selectedCustomRoleIds: [],
      allRoles: order(live, dead),
      overrides: { grant: [], revoke: [] },
    });
    expect(out).toEqual(["read:Member"]);
  });

  it("two docs claiming one key both inactive: covered, so no snapshot fallback", () => {
    const dead = (id: string, permissions: RoleDefinition["permissions"]): RoleDefinition =>
      role({
        id,
        builtIn: true,
        builtInKey: "Treasury",
        permissions,
        active: false,
        deletedAt: DELETED_AT,
      });
    const out = previewEffectivePerms({
      builtInRoleNames: ["Treasury"],
      selectedCustomRoleIds: [],
      allRoles: [dead("a", ["manage:all"]), dead("b", ["read:Member"])],
      overrides: { grant: [], revoke: [] },
    });
    expect(out).toEqual([]);
  });

  it("an active:true + deletedAt-set ghost contributes nothing on either path", () => {
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
            deletedAt: DELETED_AT,
          }),
          role({ id: "c1", permissions: ["manage:Ally"], deletedAt: DELETED_AT }),
        ],
        overrides: { grant: [], revoke: [] },
      }),
    ).toEqual([]);
  });
});
