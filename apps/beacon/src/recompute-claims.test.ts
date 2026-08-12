import { describe, expect, it } from "vitest";
import { ROLES } from "@luminova/auth/roles";
import { BUILT_IN_ROLE_PERMS } from "@luminova/types/role-definition";
import {
  planRolePermReseed,
  recomputeClaimsResult,
  type RoleSnapshot,
} from "./recompute-claims.js";

function snap(over: Partial<RoleSnapshot> & { id: string }): RoleSnapshot {
  const permissions = over.permissions ?? [];
  return {
    exists: true,
    builtInKey: over.id,
    builtIn: true,
    locked: false,
    active: true,
    permissions,
    // Default the raw view to the sanitized one, so only a test that means to exercise a
    // malformed doc has to say so.
    rawPermissions: [...permissions],
    malformedPermissions: false,
    ...over,
  };
}

describe("planRolePermReseed", () => {
  it("plans an update for a built-in role whose perms drifted from the snapshot", () => {
    const plan = planRolePermReseed([snap({ id: "Treasury", permissions: ["read:Member"] })]);
    expect(plan.applied).toEqual([
      { id: "Treasury", changedFields: ["permissions"], proposed: BUILT_IN_ROLE_PERMS.Treasury },
    ]);
    expect(plan.skipped).toEqual([]);
    expect(plan.failed).toEqual([]);
  });

  it("skips a doc that already matches, ignoring order", () => {
    const plan = planRolePermReseed([
      snap({ id: "Treasury", permissions: [...BUILT_IN_ROLE_PERMS.Treasury].reverse() }),
    ]);
    expect(plan.applied).toEqual([]);
    expect(plan.skipped).toEqual([{ id: "Treasury", reason: "unchanged" }]);
  });

  it("skips a locked doc even when it drifted", () => {
    // The admin SDK bypasses the `locked` rule the client is held to, so roles/Admin must
    // be excluded EXPLICITLY, not by assumption.
    const plan = planRolePermReseed([snap({ id: "Admin", locked: true, permissions: [] })]);
    expect(plan.applied).toEqual([]);
    expect(plan.skipped).toEqual([{ id: "Admin", reason: "locked" }]);
  });

  it("skips a doc whose builtInKey does not match its id", () => {
    const plan = planRolePermReseed([snap({ id: "Secretary", builtInKey: "Membership" })]);
    expect(plan.skipped).toEqual([{ id: "Secretary", reason: "not-built-in" }]);
  });

  it("reports a missing doc as a `missing` skip, not an apply (update() would abort the batch)", () => {
    // The operator-facing half of the two-step rollout: this callable only ever UPDATES.
    // ActivityManager and Secretary have no doc in production, so a reseed alone can never
    // create them — `seedRoles` must run first, and this reason is how an operator finds
    // that out instead of watching the two new roles stay "sin sincronizar" forever.
    const plan = planRolePermReseed([snap({ id: "Secretary", exists: false })]);
    expect(plan.applied).toEqual([]);
    expect(plan.skipped).toEqual([{ id: "Secretary", reason: "missing" }]);
    expect(plan.failed).toEqual(["Secretary"]);
  });

  it("BLOCKING: a doc carrying an invalid code is applied, not reported unchanged", () => {
    // permsFromRoleDoc silently drops anything isValidPermissionCode rejects, so a
    // console-edited `permissions` whose junk sits alongside the right codes SANITIZES to a
    // set equal to the snapshot. Comparing on the sanitized view alone reported
    // `unchanged`, left the junk on disk forever, and made this the one case an operator
    // could not tell apart from a genuinely up-to-date doc.
    const plan = planRolePermReseed([
      snap({
        id: "Treasury",
        permissions: [...BUILT_IN_ROLE_PERMS.Treasury],
        rawPermissions: [...BUILT_IN_ROLE_PERMS.Treasury, "manage:Evrything"],
        malformedPermissions: true,
      }),
    ]);
    expect(plan.skipped).toEqual([]);
    expect(plan.applied).toEqual([
      { id: "Treasury", changedFields: ["permissions"], proposed: BUILT_IN_ROLE_PERMS.Treasury },
    ]);
  });

  it("still reports a genuinely clean, matching doc as unchanged", () => {
    // The guard above must not turn every doc into a write — that would fire onRoleWritten
    // (a full members scan) for nine roles on every re-run.
    const plan = planRolePermReseed([
      snap({
        id: "Treasury",
        permissions: [...BUILT_IN_ROLE_PERMS.Treasury],
        rawPermissions: [...BUILT_IN_ROLE_PERMS.Treasury],
      }),
    ]);
    expect(plan.applied).toEqual([]);
    expect(plan.skipped).toEqual([{ id: "Treasury", reason: "unchanged" }]);
  });

  it("skips a soft-deleted built-in rather than reviving it", () => {
    // Only reachable through a prior admin-SDK write, but an update here would resurrect a
    // role nobody is meant to hold AND fire onRoleWritten across the whole members
    // collection for it.
    const plan = planRolePermReseed([snap({ id: "Treasury", active: false })]);
    expect(plan.applied).toEqual([]);
    expect(plan.skipped).toEqual([{ id: "Treasury", reason: "inactive" }]);
  });

  it("covers every ROLES key when handed a full, empty snapshot set", () => {
    const plan = planRolePermReseed(ROLES.map((id) => snap({ id, locked: id === "Admin" })));
    const touched = [...plan.applied.map((a) => a.id), ...plan.skipped.map((s) => s.id)];
    expect(touched.sort()).toEqual([...ROLES].sort());
  });

  it("stays far under the 500-write batch limit", () => {
    expect(ROLES.length).toBeLessThan(500);
  });
});

/** The one anomaly class the claims-sync logs structurally CANNOT see. Those logs only
 *  inspect docs the `where("builtInKey","in",keys)` query MATCHED, so a doc whose
 *  `builtInKey` is absent or mis-cased never matches: its key stays uncovered, the seed
 *  fallback re-mints, and deactivating that role is a silent no-op `/permisos` still reports
 *  as a revocation — with nothing logged anywhere. This callable reads all nine docs BY ID,
 *  so it is the only code that can see them. Deploy-check 3 of docs/specs/role-lifecycle.md,
 *  as a signal instead of prose. */
describe("planRolePermReseed coverage anomalies", () => {
  it("reports nothing for a well-formed doc set", () => {
    const plan = planRolePermReseed(ROLES.map((id) => snap({ id })));
    expect(plan.coverageAnomalies).toEqual([]);
  });

  it("BLOCKING: flags a doc that is not marked builtIn:true — the claims query DROPS it", () => {
    const plan = planRolePermReseed([snap({ id: "Treasury", builtIn: false })]);
    expect(plan.coverageAnomalies).toEqual([
      { id: "Treasury", builtIn: false, builtInKey: "Treasury", problem: "not-marked-built-in" },
    ]);
  });

  it("BLOCKING: flags an ABSENT builtInKey — the claims query never MATCHES it", () => {
    // The shape no log can see: the doc exists and looks fine on /permisos, but the field
    // query cannot reach it, so its key is served from BUILT_IN_ROLE_PERMS forever.
    const plan = planRolePermReseed([snap({ id: "Treasury", builtInKey: null })]);
    expect(plan.coverageAnomalies).toEqual([
      { id: "Treasury", builtIn: true, builtInKey: null, problem: "built-in-key-missing" },
    ]);
  });

  it("flags a MIS-CASED / mismatched builtInKey", () => {
    const plan = planRolePermReseed([snap({ id: "Treasury", builtInKey: "treasury" })]);
    expect(plan.coverageAnomalies).toEqual([
      { id: "Treasury", builtIn: true, builtInKey: "treasury", problem: "built-in-key-mismatch" },
    ]);
  });

  it("reports BOTH problems when a doc has neither builtIn:true nor a builtInKey", () => {
    const plan = planRolePermReseed([snap({ id: "Treasury", builtIn: false, builtInKey: null })]);
    expect(plan.coverageAnomalies.map((a) => a.problem)).toEqual([
      "not-marked-built-in",
      "built-in-key-missing",
    ]);
  });

  it("reports a LOCKED or INACTIVE doc too — the claims query does not care that it is unwritable", () => {
    // Gating the report on the doc being writable would hide the most consequential case:
    // roles/Admin missing builtIn:true is exactly as invisible to the claims query.
    const plan = planRolePermReseed([
      snap({ id: "Admin", locked: true, builtIn: false }),
      snap({ id: "Treasury", active: false, builtInKey: null }),
    ]);
    expect(plan.coverageAnomalies.map((a) => [a.id, a.problem])).toEqual([
      ["Admin", "not-marked-built-in"],
      ["Treasury", "built-in-key-missing"],
    ]);
  });

  it("does not double-report a MISSING doc, which is already failed", () => {
    const plan = planRolePermReseed([snap({ id: "Secretary", exists: false, builtIn: false })]);
    expect(plan.coverageAnomalies).toEqual([]);
    expect(plan.failed).toEqual(["Secretary"]);
  });

  it("keeps anomalies OUT of `failed` — `failed` stays the seedRoles shorthand", () => {
    // `failed` is documented as exactly the `missing` ids ("run seedRoles first"). An anomaly
    // needs a console field edit instead, so folding it in would break that instruction.
    const plan = planRolePermReseed([snap({ id: "Treasury", builtIn: false })]);
    expect(plan.failed).toEqual([]);
    expect(plan.coverageAnomalies).toHaveLength(1);
  });
});

/** `recomputeAllClaims` has no in-repo caller: a human reading the response is the only
 *  consumer, so nothing but this test pins the contract. Documented beside the operator
 *  sequence in apps/beacon/CLAUDE.md. */
describe("recomputeClaimsResult", () => {
  it("BLOCKING: ok is FALSE whenever any member failed", () => {
    // This callable IS the backstop for a partial onRoleWritten fan-out, so an ok:true beside
    // a non-empty failed would report success at the moment members are still stranded.
    expect(recomputeClaimsResult(120, ["member-a"])).toEqual({
      ok: false,
      synced: 120,
      failed: ["member-a"],
    });
  });

  it("ok is true only on a completely clean run", () => {
    expect(recomputeClaimsResult(120, [])).toEqual({ ok: true, synced: 120, failed: [] });
  });

  it("ok is true for an empty collection (nothing to sync is not a failure)", () => {
    expect(recomputeClaimsResult(0, [])).toEqual({ ok: true, synced: 0, failed: [] });
  });

  it("does not alias the caller's array", () => {
    const failed = ["member-a"];
    const result = recomputeClaimsResult(1, failed);
    failed.push("member-b");
    expect(result.failed).toEqual(["member-a"]);
  });
});
