import { describe, expect, it } from "vitest";
import type { Role } from "@luminova/auth/roles";
import { syncMemberClaims, type ClaimsSyncDeps } from "./sync.js";

type Claims = { roles: Role[]; scannerEventIds?: string[] };

function fakeDeps(opts: {
  positions: Record<string, { grants: Role[] }>;
  userRoles: Record<string, Role[]>;
  existing: Record<string, Claims>;
}) {
  const writes: Record<string, Claims> = {};
  const deps: ClaimsSyncDeps = {
    getPosition: async (id) => opts.positions[id] ?? null,
    getUserRoles: async (uid) => opts.userRoles[uid] ?? [],
    getExistingClaims: async (uid) => opts.existing[uid] ?? { roles: [] },
    setClaims: async (uid, claims) => {
      writes[uid] = claims;
    },
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
        positions: { "2026": { cargoId: "pos-pres", comisionIds: [], assignedBy: "membership-uid" } },
      },
      "2026",
    );
    expect(writes["target-uid"]).toBeUndefined(); // already ['Member'] → no-op
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
    expect(writes["target-uid"]).toEqual({ roles: ["Admin", "Member"] });
  });

  it("drops power grants when assignedBy is missing (legacy doc)", async () => {
    const { deps, writes } = fakeDeps({
      positions: { "pos-pres": { grants: ["Admin"] } },
      userRoles: {},
      existing: { "target-uid": { roles: ["Admin", "Member"] } },
    });
    await syncMemberClaims(
      deps,
      { uid: "target-uid", positions: { "2026": { cargoId: "pos-pres", comisionIds: [] } } },
      "2026",
    );
    expect(writes["target-uid"]).toEqual({ roles: ["Member"] }); // Admin revoked
  });

  it("preserves Scanner + scannerEventIds while recomputing org roles", async () => {
    const { deps, writes } = fakeDeps({
      positions: { "pos-tes": { grants: ["Treasury"] } },
      userRoles: { "admin-uid": ["Admin"] },
      existing: { "target-uid": { roles: ["Member", "Scanner"], scannerEventIds: ["e1"] } },
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
      scannerEventIds: ["e1"],
    });
  });

  it("no-ops when member has no uid (not provisioned)", async () => {
    const { deps, writes } = fakeDeps({ positions: {}, userRoles: {}, existing: {} });
    await syncMemberClaims(deps, { positions: { "2026": { cargoId: "x", comisionIds: [] } } }, "2026");
    expect(writes).toEqual({});
  });

  it("revokes to ['Member'] when the current-term cargo is cleared", async () => {
    const { deps, writes } = fakeDeps({
      positions: {},
      userRoles: {},
      existing: { "target-uid": { roles: ["Treasury", "Member"] } },
    });
    await syncMemberClaims(
      deps,
      { uid: "target-uid", positions: { "2026": { cargoId: null, comisionIds: [], assignedBy: "admin-uid" } } },
      "2026",
    );
    expect(writes["target-uid"]).toEqual({ roles: ["Member"] });
  });

  it("drops grants from a missing/deleted position", async () => {
    const { deps, writes } = fakeDeps({
      positions: {}, // pos-pres not in catalog (deleted)
      userRoles: { "admin-uid": ["Admin"] },
      existing: { "target-uid": { roles: ["Admin", "Member"] } },
    });
    await syncMemberClaims(
      deps,
      { uid: "target-uid", positions: { "2026": { cargoId: "pos-pres", comisionIds: [], assignedBy: "admin-uid" } } },
      "2026",
    );
    expect(writes["target-uid"]).toEqual({ roles: ["Member"] });
  });

  it("honors a power-conferring comisión when assignedBy is Admin", async () => {
    const { deps, writes } = fakeDeps({
      positions: { "com-x": { grants: ["ProjectManager"] } },
      userRoles: { "admin-uid": ["Admin"] },
      existing: { "target-uid": { roles: ["Member"] } },
    });
    await syncMemberClaims(
      deps,
      { uid: "target-uid", positions: { "2026": { cargoId: null, comisionIds: ["com-x"], assignedBy: "admin-uid" } } },
      "2026",
    );
    expect(writes["target-uid"]).toEqual({ roles: ["ProjectManager", "Member"] });
  });

  it("drops a power-conferring comisión assigned by a non-Admin", async () => {
    const { deps, writes } = fakeDeps({
      positions: { "com-power": { grants: ["Treasury"] } },
      userRoles: { "mem-uid": ["Membership"] },
      existing: { "target-uid": { roles: ["Treasury", "Member"] } },
    });
    await syncMemberClaims(
      deps,
      { uid: "target-uid", positions: { "2026": { cargoId: null, comisionIds: ["com-power"], assignedBy: "mem-uid" } } },
      "2026",
    );
    expect(writes["target-uid"]).toEqual({ roles: ["Member"] }); // Treasury revoked
  });

  it("unions grants from cargo + comisión, deduped and ROLES-ordered", async () => {
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
      { uid: "target-uid", positions: { "2026": { cargoId: "pos-tes", comisionIds: ["com-y"], assignedBy: "admin-uid" } } },
      "2026",
    );
    expect(writes["target-uid"]).toEqual({
      roles: ["Membership", "Treasury", "ExecutiveCommittee", "Member"],
    });
  });

  it("propagates and writes nothing when a dependency rejects", async () => {
    const writes: Record<string, { roles: Role[]; scannerEventIds?: string[] }> = {};
    const deps: ClaimsSyncDeps = {
      getPosition: async () => ({ grants: ["Admin"] }),
      getUserRoles: async () => {
        throw new Error("auth lookup failed");
      },
      getExistingClaims: async () => ({ roles: ["Member"] }),
      setClaims: async (uid, claims) => {
        writes[uid] = claims;
      },
    };
    await expect(
      syncMemberClaims(
        deps,
        { uid: "target-uid", positions: { "2026": { cargoId: "pos-pres", comisionIds: [], assignedBy: "admin-uid" } } },
        "2026",
      ),
    ).rejects.toThrow("auth lookup failed");
    expect(writes).toEqual({});
  });
});
