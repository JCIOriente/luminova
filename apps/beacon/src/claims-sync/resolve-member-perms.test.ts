import { describe, expect, it } from "vitest";
import type { Role } from "@luminova/auth/roles";
import { BUILT_IN_ROLE_PERMS } from "@luminova/types/role-definition";
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
          { permissions: ["read:Member"], builtInKey: "Treasury", live: true },
        ],
      }),
      ["Treasury"],
      [],
      NO_OVERRIDES,
    );
    expect(out).toEqual(["read:Member"]);
  });

  it("BLOCKING: an inactive built-in doc contributes nothing AND suppresses the seed fallback", async () => {
    // The whole reason firestore.rules used to deny deactivating a built-in: a missing doc
    // and an inactive doc were indistinguishable, so dropping the inactive doc from the
    // query made the key UNCOVERED and re-minted BUILT_IN_ROLE_PERMS. Perms deliberately
    // non-empty so a resolver that ignores `live` fails loudly instead of coincidentally
    // returning [].
    const out = await resolveMemberPerms(
      deps({
        getRoleDocsByBuiltInKeys: async () => [
          { permissions: ["manage:all"], builtInKey: "Treasury", live: false },
        ],
      }),
      ["Treasury"],
      [],
      NO_OVERRIDES,
    );
    expect(out).toEqual([]);
  });

  it("an inactive doc for one key does not suppress another key's seed fallback", async () => {
    const out = await resolveMemberPerms(
      deps({
        getRoleDocsByBuiltInKeys: async () => [
          { permissions: ["manage:all"], builtInKey: "Treasury", live: false },
        ],
      }),
      ["Treasury", "Membership"],
      [],
      NO_OVERRIDES,
    );
    expect(out).toEqual([...BUILT_IN_ROLE_PERMS.Membership].sort());
  });

  it("mixes an active doc, an inactive doc and an unseeded key in one resolution", async () => {
    const out = await resolveMemberPerms(
      deps({
        getRoleDocsByBuiltInKeys: async () => [
          { permissions: ["read:Position"], builtInKey: "Membership", live: true },
          { permissions: ["manage:all"], builtInKey: "Treasury", live: false },
        ],
      }),
      ["Membership", "Treasury", "Secretary"],
      [],
      NO_OVERRIDES,
    );
    expect(out).toEqual([...new Set(["read:Position", ...BUILT_IN_ROLE_PERMS.Secretary])].sort());
  });

  it("unions custom role perms with built-in perms", async () => {
    const out = await resolveMemberPerms(
      deps({ getRolesByIds: async () => [{ permissions: ["manage:Ally"] }] }),
      ["Member"],
      ["role-x"],
      NO_OVERRIDES,
    );
    // Member now contributes its coarse reads; the custom role adds manage:Ally.
    expect(out).toEqual([
      "manage:Ally",
      "read:Activity",
      "read:Member",
      "read:MemberPoints",
      "read:Program",
      "read:Project",
    ]);
  });

  it("applies overrides on top of resolved role perms", async () => {
    const out = await resolveMemberPerms(deps(), ["Treasury"], [], {
      grant: ["manage:Position"],
      revoke: ["read:Member"],
    });
    expect(out).toEqual(["manage:Position", "read:MemberPoints"]);
  });

  it("resolves the coarse reads for a plain Member/Scanner with no extras", async () => {
    // Scanner is no longer conditional-only: event scoping was abandoned, so it carries
    // coarse read:Activity + checkIn:Attendance alongside Member's member-facing reads.
    const roles: Role[] = ["Member", "Scanner"];
    expect(await resolveMemberPerms(deps(), roles, [], NO_OVERRIDES)).toEqual([
      "checkIn:Attendance",
      "read:Activity",
      "read:Member",
      "read:MemberPoints",
      "read:Program",
      "read:Project",
    ]);
  });
});
