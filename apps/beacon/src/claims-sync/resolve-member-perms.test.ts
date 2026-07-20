import { describe, expect, it } from "vitest";
import type { Role } from "@luminova/auth/roles";
import { resolveMemberPerms, type RolePermsDeps } from "./resolve-member-perms.js";

const deps = (over: Partial<RolePermsDeps> = {}): RolePermsDeps => ({
  getRoleDocsByBuiltInKeys: async () => [],
  getRolesByIds: async () => [],
  ...over,
});

const NO_OVERRIDES = { grant: [], revoke: [] } as const;

describe("resolveMemberPerms", () => {
  it("falls back to the seed snapshot when a built-in role has no live doc", async () => {
    const out = await resolveMemberPerms(deps(), ["Treasury"], [], NO_OVERRIDES);
    expect(out).toEqual(["read:Member", "read:MemberPoints"]);
  });

  it("prefers the live built-in role doc over the seed snapshot", async () => {
    const out = await resolveMemberPerms(
      deps({
        getRoleDocsByBuiltInKeys: async () => [
          { permissions: ["read:Member"], builtInKey: "Treasury" },
        ],
      }),
      ["Treasury"],
      [],
      NO_OVERRIDES,
    );
    expect(out).toEqual(["read:Member"]);
  });

  it("unions custom role perms with built-in perms", async () => {
    const out = await resolveMemberPerms(
      deps({ getRolesByIds: async () => [{ permissions: ["manage:Ally"] }] }),
      ["Member"],
      ["role-x"],
      NO_OVERRIDES,
    );
    expect(out).toEqual(["manage:Ally"]);
  });

  it("applies overrides on top of resolved role perms", async () => {
    const out = await resolveMemberPerms(deps(), ["Treasury"], [], {
      grant: ["manage:Position"],
      revoke: ["read:Member"],
    });
    expect(out).toEqual(["manage:Position", "read:MemberPoints"]);
  });

  it("returns empty for conditional-only roles (Member/Scanner) with no extras", async () => {
    const roles: Role[] = ["Member", "Scanner"];
    expect(await resolveMemberPerms(deps(), roles, [], NO_OVERRIDES)).toEqual([]);
  });
});
