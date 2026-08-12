import { describe, expect, it } from "vitest";
import type { Role } from "@luminova/auth/roles";
import type { PermissionCode, RoleDefinition } from "@luminova/types";
import { BUILT_IN_ROLE_PERMS } from "@luminova/types/role-definition";
import { ACTIONS, SUBJECTS } from "@luminova/types/permission";
import { syncMemberClaims, type ClaimsSyncDeps, type MemberClaims } from "./sync.js";
import { parseMember } from "./parse-member.js";
import { isActiveRoleDoc } from "./role-doc.js";

type Claims = { roles: Role[]; perms?: PermissionCode[] };

/** Expected coarse perms for a set of built-in roles via the seed snapshot
 *  (independent union+sort, so the assertion isn't tautological with the impl). */
function permsFor(roles: Role[]): PermissionCode[] {
  return [...new Set(roles.flatMap((r) => BUILT_IN_ROLE_PERMS[r]))].sort();
}

/** A Timestamp-shaped soft-delete marker: only isActiveRoleDoc's null/undefined check
 *  reads this field, so the marker's own type is irrelevant to what is under test. */
const DELETED_AT = { toMillis: () => 0 } as unknown as RoleDefinition["deletedAt"];

const customRole = (id: string, permissions: PermissionCode[]): RoleDefinition => ({
  id,
  name: id,
  description: "",
  builtIn: false,
  builtInKey: null,
  permissions,
  locked: false,
  active: true,
  deletedAt: null,
});

function fakeDeps(opts: {
  positions: Record<string, { grants: Role[] }>;
  userRoles: Record<string, Role[]>;
  existing: Record<string, Claims>;
  builtInDocs?: RoleDefinition[];
  customRoles?: Record<string, RoleDefinition>;
  logError?: (message: string, meta: Record<string, unknown>) => void;
}) {
  const writes: Record<string, MemberClaims> = {};
  const deps: ClaimsSyncDeps = {
    getPosition: async (id) => opts.positions[id] ?? null,
    getUserRoles: async (uid) => opts.userRoles[uid] ?? [],
    getExistingClaims: async (uid) => opts.existing[uid] ?? { roles: [] },
    // COVERAGE is preserved (no liveness filter — a deactivated built-in must still reach
    // resolveMemberPerms so it COVERS its key), but `live` is COMPUTED with the production
    // predicate over BOTH `active` and `deletedAt`. Forwarding the doc's raw `active` field
    // would call the ghost shape (active:true + deletedAt set) live and mint its real perms.
    getRoleDocsByBuiltInKeys: async (keys) =>
      (opts.builtInDocs ?? [])
        .filter(
          (d): d is RoleDefinition & { builtInKey: Role } =>
            d.builtInKey !== null && keys.includes(d.builtInKey),
        )
        .map((d) => ({
          permissions: d.permissions,
          builtInKey: d.builtInKey,
          live: isActiveRoleDoc({ active: d.active, deletedAt: d.deletedAt }),
        })),
    // Mirrors the REAL getRolesByIds, which filters inactive docs (there is no seed
    // fallback on the custom-role path, so dropping them here is what production does).
    // A fake that returned them regardless was MORE PERMISSIVE than what ships: no test
    // at this level could express "a deactivated custom role contributes nothing", and
    // the invariant rested on one emulator test. The production predicate is called, not
    // re-implemented, so the two cannot drift.
    getRolesByIds: async (ids) =>
      ids
        .map((id) => opts.customRoles?.[id])
        .filter((r): r is RoleDefinition => r !== undefined)
        .filter((r) => isActiveRoleDoc({ active: r.active, deletedAt: r.deletedAt })),
    setClaims: async (uid, claims) => {
      writes[uid] = claims;
    },
    logError: opts.logError,
  };
  return { deps, writes };
}

describe("syncMemberClaims", () => {
  it("BLOCKING: Membership assigns Presidente cargo → no Admin claim", async () => {
    const { deps, writes } = fakeDeps({
      positions: { "pos-pres": { grants: ["Admin"] } },
      userRoles: { "membership-uid": ["Membership", "Member"] },
      existing: { "target-uid": { roles: ["Member"] } },
    });
    await syncMemberClaims(
      deps,
      {
        uid: "target-uid",
        positions: {
          "2026": { cargoId: "pos-pres", comisionIds: [], assignedBy: "membership-uid" },
        },
      },
      "2026",
    );
    // Membership can't confer Admin: the member is recomputed to a plain Member claim.
    expect(writes["target-uid"]).toEqual({ roles: ["Member"], perms: permsFor(["Member"]) });
  });

  it("honors power grants when assignedBy is Admin", async () => {
    const { deps, writes } = fakeDeps({
      positions: { "pos-pres": { grants: ["Admin"] } },
      userRoles: { "admin-uid": ["Admin", "Member"] },
      existing: { "target-uid": { roles: ["Member"] } },
    });
    await syncMemberClaims(
      deps,
      {
        uid: "target-uid",
        positions: { "2026": { cargoId: "pos-pres", comisionIds: [], assignedBy: "admin-uid" } },
      },
      "2026",
    );
    expect(writes["target-uid"]).toEqual({
      roles: ["Admin", "Member"],
      perms: permsFor(["Admin", "Member"]),
    });
  });

  it("drops power grants when assignedBy is missing (legacy doc)", async () => {
    const { deps, writes } = fakeDeps({
      positions: { "pos-pres": { grants: ["Admin"] } },
      userRoles: {},
      existing: { "target-uid": { roles: ["Admin", "Member"], perms: ["manage:all"] } },
    });
    await syncMemberClaims(
      deps,
      { uid: "target-uid", positions: { "2026": { cargoId: "pos-pres", comisionIds: [] } } },
      "2026",
    );
    // Admin revoked → back to a plain Member claim (which carries the Member reads).
    expect(writes["target-uid"]).toEqual({ roles: ["Member"], perms: permsFor(["Member"]) });
  });

  it("preserves the Scanner role while recomputing org roles + perms", async () => {
    // The ROLE survives a positions-driven recompute (it is not position-derived); the
    // removed scannerEventIds claim does not come back.
    const { deps, writes } = fakeDeps({
      positions: { "pos-tes": { grants: ["Treasury"] } },
      userRoles: { "admin-uid": ["Admin"] },
      existing: { "target-uid": { roles: ["Member", "Scanner"] } },
    });
    await syncMemberClaims(
      deps,
      {
        uid: "target-uid",
        positions: { "2026": { cargoId: "pos-tes", comisionIds: [], assignedBy: "admin-uid" } },
      },
      "2026",
    );
    expect(writes["target-uid"]).toEqual({
      roles: ["Treasury", "Scanner", "Member"],
      perms: permsFor(["Treasury", "Scanner", "Member"]),
    });
  });

  it("no-ops when member has no uid (not provisioned)", async () => {
    const { deps, writes } = fakeDeps({ positions: {}, userRoles: {}, existing: {} });
    await syncMemberClaims(
      deps,
      { positions: { "2026": { cargoId: "x", comisionIds: [] } } },
      "2026",
    );
    expect(writes).toEqual({});
  });

  it("revokes to a plain Member claim when the current-term cargo is cleared", async () => {
    const { deps, writes } = fakeDeps({
      positions: {},
      userRoles: {},
      existing: { "target-uid": { roles: ["Treasury", "Member"], perms: permsFor(["Treasury"]) } },
    });
    await syncMemberClaims(
      deps,
      {
        uid: "target-uid",
        positions: { "2026": { cargoId: null, comisionIds: [], assignedBy: "admin-uid" } },
      },
      "2026",
    );
    expect(writes["target-uid"]).toEqual({ roles: ["Member"], perms: permsFor(["Member"]) });
  });

  it("honors ONLY the cargo's grants — comisión grants are never power, even Admin-assigned", async () => {
    // Comisiones are chips-only (position-schema forbids Comision grants; rules
    // enforce it). A console-written power comisión — or a power cargo's id
    // smuggled into comisionIds, which rules never grant-check — must not mint
    // claims, and rules cannot iterate comisionIds to gate it themselves.
    const { deps, writes } = fakeDeps({
      positions: {
        "pos-tes": { grants: ["Treasury", "ExecutiveCommittee"] },
        "com-y": { grants: ["ExecutiveCommittee", "Membership"] },
      },
      userRoles: { "admin-uid": ["Admin"] },
      existing: { "target-uid": { roles: ["Member"] } },
    });
    await syncMemberClaims(
      deps,
      {
        uid: "target-uid",
        positions: {
          "2026": { cargoId: "pos-tes", comisionIds: ["com-y"], assignedBy: "admin-uid" },
        },
      },
      "2026",
    );
    const roles: Role[] = ["Treasury", "ExecutiveCommittee", "Member"];
    expect(writes["target-uid"]).toEqual({ roles, perms: permsFor(roles) });
  });

  it("a power cargo id smuggled into comisionIds confers nothing (no cargo assigned)", async () => {
    const { deps, writes } = fakeDeps({
      positions: { "pos-pres": { grants: ["Admin"] } },
      userRoles: { "admin-uid": ["Admin"] },
      existing: { "target-uid": { roles: ["Member"] } },
    });
    await syncMemberClaims(
      deps,
      {
        uid: "target-uid",
        positions: {
          "2026": { cargoId: null, comisionIds: ["pos-pres"], assignedBy: "admin-uid" },
        },
      },
      "2026",
    );
    // The smuggled power id confers nothing: the member stays a plain Member.
    expect(writes["target-uid"]).toEqual({ roles: ["Member"], perms: permsFor(["Member"]) });
  });

  it("includes perms from a directly-assigned custom role", async () => {
    const { deps, writes } = fakeDeps({
      positions: {},
      userRoles: {},
      existing: { "target-uid": { roles: ["Member"] } },
      customRoles: { "role-x": customRole("role-x", ["manage:Ally", "read:Position"]) },
    });
    await syncMemberClaims(
      deps,
      {
        uid: "target-uid",
        positions: {},
        roleIds: ["role-x"],
        permissionOverrides: { grant: [], revoke: [] },
      },
      "2026",
    );
    // Union of the custom role's perms with the Member built-in reads.
    expect(writes["target-uid"]).toEqual({
      roles: ["Member"],
      perms: [
        "manage:Ally",
        "read:Activity",
        "read:Member",
        "read:MemberPoints",
        "read:Position",
        "read:Program",
        "read:Project",
      ],
    });
  });

  it("BLOCKING: a DEACTIVATED custom role in roleIds contributes nothing", async () => {
    const { deps, writes } = fakeDeps({
      positions: {},
      userRoles: {},
      existing: { "target-uid": { roles: ["Member"], perms: ["manage:Ally"] } },
      customRoles: { "role-x": { ...customRole("role-x", ["manage:Ally"]), active: false } },
    });
    await syncMemberClaims(
      deps,
      {
        uid: "target-uid",
        positions: {},
        roleIds: ["role-x"],
        permissionOverrides: { grant: [], revoke: [] },
      },
      "2026",
    );
    // Nothing from the deactivated role survives — only the Member built-in reads.
    expect(writes["target-uid"]).toEqual({ roles: ["Member"], perms: permsFor(["Member"]) });
  });

  it("a soft-deleted custom role (deletedAt set) also contributes nothing", async () => {
    const { deps, writes } = fakeDeps({
      positions: {},
      userRoles: {},
      existing: { "target-uid": { roles: ["Member"] } },
      customRoles: {
        // active:true + deletedAt set is the ghost shape isActiveRoleDoc also rejects.
        "role-x": { ...customRole("role-x", ["manage:Ally"]), deletedAt: DELETED_AT },
      },
    });
    await syncMemberClaims(
      deps,
      {
        uid: "target-uid",
        positions: {},
        roleIds: ["role-x"],
        permissionOverrides: { grant: [], revoke: [] },
      },
      "2026",
    );
    expect(writes["target-uid"]).toEqual({ roles: ["Member"], perms: permsFor(["Member"]) });
  });

  it("applies per-member overrides (grant adds, revoke removes)", async () => {
    const { deps, writes } = fakeDeps({
      positions: { "pos-tes": { grants: ["Treasury"] } },
      userRoles: { "admin-uid": ["Admin"] },
      existing: { "target-uid": { roles: ["Member"] } },
    });
    await syncMemberClaims(
      deps,
      {
        uid: "target-uid",
        positions: { "2026": { cargoId: "pos-tes", comisionIds: [], assignedBy: "admin-uid" } },
        roleIds: [],
        permissionOverrides: { grant: ["manage:Position"], revoke: ["read:Member"] },
      },
      "2026",
    );
    // Treasury+Member reads = read:Member, read:MemberPoints, read:Activity, read:Program,
    // read:Project; +manage:Position, -read:Member.
    expect(writes["target-uid"]).toEqual({
      roles: ["Treasury", "Member"],
      perms: [
        "manage:Position",
        "read:Activity",
        "read:MemberPoints",
        "read:Program",
        "read:Project",
      ],
    });
  });

  it("uses the live built-in role doc perms over the seed fallback", async () => {
    const { deps, writes } = fakeDeps({
      positions: { "pos-tes": { grants: ["Treasury"] } },
      userRoles: { "admin-uid": ["Admin"] },
      existing: { "target-uid": { roles: ["Member"] } },
      builtInDocs: [
        { ...customRole("Treasury", ["read:Member"]), builtIn: true, builtInKey: "Treasury" },
      ],
    });
    await syncMemberClaims(
      deps,
      {
        uid: "target-uid",
        positions: { "2026": { cargoId: "pos-tes", comisionIds: [], assignedBy: "admin-uid" } },
      },
      "2026",
    );
    // Live Treasury doc was edited down to just read:Member (not the seed default); Member's
    // seed reads still union in, and they now include read:MemberPoints + read:Project.
    expect(writes["target-uid"]).toEqual({
      roles: ["Treasury", "Member"],
      perms: ["read:Activity", "read:Member", "read:MemberPoints", "read:Program", "read:Project"],
    });
  });

  it("BLOCKING: a ghost built-in doc (active:true + deletedAt set) mints nothing and still covers its key", async () => {
    const { deps, writes } = fakeDeps({
      positions: { "pos-tes": { grants: ["Treasury"] } },
      userRoles: { "admin-uid": ["Admin"] },
      existing: { "target-uid": { roles: ["Member"] } },
      builtInDocs: [
        {
          ...customRole("Treasury", ["manage:all"]),
          builtIn: true,
          builtInKey: "Treasury",
          deletedAt: DELETED_AT,
        },
      ],
    });
    await syncMemberClaims(
      deps,
      {
        uid: "target-uid",
        positions: { "2026": { cargoId: "pos-tes", comisionIds: [], assignedBy: "admin-uid" } },
      },
      "2026",
    );
    // manage:all deliberately: a deps impl that forwarded the doc's raw `active` field in
    // place of the two-field liveness predicate would mint it right here. The Treasury key
    // stays COVERED either way, so its seed snapshot must not return through the fallback.
    expect(writes["target-uid"]).toEqual({
      roles: ["Treasury", "Member"],
      perms: permsFor(["Member"]),
    });
  });

  it("fail-closed: writes empty perms (not stale claims) when effective perms exceed the cap", async () => {
    const errors: string[] = [];
    const { deps, writes } = fakeDeps({
      positions: {},
      userRoles: {},
      // Stale elevated claims must be cleared, not retained, on a cap breach.
      existing: { "target-uid": { roles: ["Admin", "Member"], perms: ["manage:all"] } },
      customRoles: { big: customRole("big", distinctCodes(31)) },
      logError: (message) => errors.push(message),
    });
    await syncMemberClaims(
      deps,
      {
        uid: "target-uid",
        positions: {},
        roleIds: ["big"],
        permissionOverrides: { grant: [], revoke: [] },
      },
      "2026",
    );
    expect(writes["target-uid"]).toEqual({ roles: ["Member"], perms: [] });
    expect(errors[0]).toMatch(/cap/i);
  });

  it("propagates and writes nothing when a dependency rejects", async () => {
    const writes: Record<string, MemberClaims> = {};
    const deps: ClaimsSyncDeps = {
      getPosition: async () => ({ grants: ["Admin"] }),
      getUserRoles: async () => {
        throw new Error("auth lookup failed");
      },
      getExistingClaims: async () => ({ roles: ["Member"] }),
      getRoleDocsByBuiltInKeys: async () => [],
      getRolesByIds: async () => [],
      setClaims: async (uid, claims) => {
        writes[uid] = claims;
      },
    };
    await expect(
      syncMemberClaims(
        deps,
        {
          uid: "target-uid",
          positions: { "2026": { cargoId: "pos-pres", comisionIds: [], assignedBy: "admin-uid" } },
        },
        "2026",
      ),
    ).rejects.toThrow("auth lookup failed");
    expect(writes).toEqual({});
  });

  it("parseMember output flows through (absent comisionIds power cargo, non-Admin → dropped)", async () => {
    const { deps, writes } = fakeDeps({
      positions: { "pos-pres": { grants: ["Admin"] } },
      userRoles: { "membership-uid": ["Membership", "Member"] },
      existing: { "target-uid": { roles: ["Member"] } },
    });
    const member = parseMember({
      uid: "target-uid",
      positions: { "2026": { cargoId: "pos-pres", assignedBy: "membership-uid" } },
    });
    await syncMemberClaims(deps, member, "2026");
    // No Admin escalation: recomputed to a plain Member claim.
    expect(writes["target-uid"]).toEqual({ roles: ["Member"], perms: permsFor(["Member"]) });
  });
});

/** N distinct valid permission codes, for cap testing. */
function distinctCodes(n: number): PermissionCode[] {
  const out: PermissionCode[] = [];
  for (const a of ACTIONS)
    for (const s of SUBJECTS) {
      if (out.length >= n) return out;
      out.push(`${a}:${s}` as PermissionCode);
    }
  return out;
}
