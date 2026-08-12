import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteApp } from "firebase-admin/app";
import type { WriteBatch } from "firebase-admin/firestore";
import type { CallableRequest } from "firebase-functions/v2/https";
import { BUILT_IN_ROLE_PERMS } from "@luminova/types/role-definition";
import { clearCollections, initEmulatorTestApp } from "./award-points/emulator-harness.js";
import { seedBuiltInRoles } from "./seed-roles.js";
import { reseedBuiltInRolePerms } from "./recompute-claims.js";

// The pure planner is covered by recompute-claims.test.ts. THIS suite exercises the onCall
// wrapper itself — requireAdmin, the confirm/dryRun gate, the real batch.commit() and the
// ordering of the audit log against it — none of which the planner can reach.

const { app, db } = initEmulatorTestApp();

// Deliberately re-typed here rather than imported: an independent mirror of the operator's
// contract. If the constant is ever renamed, this suite must go red, not silently follow.
const CONFIRM = "overwrite-builtin-roles";

beforeEach(async () => {
  await clearCollections(db, ["roles"]);
  await seedBuiltInRoles(db);
});
afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(async () => {
  await deleteApp(app);
});

/** `.run()` is the firebase-functions test seam for an onCall handler. The handler reads
 *  only `data`, `auth.uid` and `auth.token.roles`; the rest of CallableRequest is
 *  Express/App-Check plumbing a direct invocation never touches, so a cast is honest here
 *  rather than fabricating a raw HTTP request. */
function invoke(data: unknown, roles?: string[]) {
  const auth = roles ? { uid: "caller-uid", token: { roles } } : undefined;
  return reseedBuiltInRolePerms.run({ data, auth } as unknown as CallableRequest<unknown>);
}

/** Drift a doc off the snapshot so a reseed has something to do, and give it display text
 *  a reseed must not touch. */
async function driftTreasury() {
  await db.doc("roles/Treasury").update({
    permissions: ["read:Member"],
    name: "Tesorería (renombrada)",
    description: "Texto que el operador escribió a mano.",
  });
}

describe("reseedBuiltInRolePerms (emulator) — the callable wrapper", () => {
  it("rejects a caller who is not an Admin, and writes nothing", async () => {
    await driftTreasury();
    await expect(invoke({ confirm: CONFIRM }, ["Membership", "Member"])).rejects.toThrow(
      /Admin role required/,
    );
    await expect(invoke({ confirm: CONFIRM })).rejects.toThrow(/sign-in required/);
    expect((await db.doc("roles/Treasury").get()).get("permissions")).toEqual(["read:Member"]);
  });

  it("rejects a real run without the confirm token, and writes nothing", async () => {
    await driftTreasury();
    await expect(invoke({}, ["Admin"])).rejects.toThrow(/confirm must be/);
    await expect(invoke({ confirm: "yes" }, ["Admin"])).rejects.toThrow(/confirm must be/);
    expect((await db.doc("roles/Treasury").get()).get("permissions")).toEqual(["read:Member"]);
  });

  it("dryRun needs no confirm and writes nothing", async () => {
    await driftTreasury();
    const result = await invoke({ dryRun: true }, ["Admin"]);
    expect(result.dryRun).toBe(true);
    expect(result.applied).toEqual([]);
    if (result.dryRun) {
      expect(result.preview).toContainEqual({
        id: "Treasury",
        current: ["read:Member"],
        proposed: BUILT_IN_ROLE_PERMS.Treasury,
      });
    }
    const after = await db.doc("roles/Treasury").get();
    expect(after.get("permissions")).toEqual(["read:Member"]);
    expect(after.get("name")).toBe("Tesorería (renombrada)");
  });

  it("a real run commits `permissions` and leaves name/description alone", async () => {
    await driftTreasury();
    const result = await invoke({ confirm: CONFIRM }, ["Admin"]);
    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(false);
    expect(result.applied).toContainEqual({ id: "Treasury", changedFields: ["permissions"] });
    expect(result.failed).toEqual([]);

    const after = await db.doc("roles/Treasury").get();
    expect(after.get("permissions")).toEqual(BUILT_IN_ROLE_PERMS.Treasury);
    // The whole reason the reseed writes ONE field: an operator re-running it must not
    // silently revert every rename.
    expect(after.get("name")).toBe("Tesorería (renombrada)");
    expect(after.get("description")).toBe("Texto que el operador escribió a mano.");
  });

  it("normalizes a doc whose only drift is an invalid code, and previews it RAW", async () => {
    // The sanitized view of this doc already equals the snapshot, so the pre-fix planner
    // called it `unchanged` and the junk stayed on disk forever — the one case an operator
    // could not tell apart from an up-to-date doc.
    const junk = [...BUILT_IN_ROLE_PERMS.Treasury, "manage:Evrything"];
    await db.doc("roles/Treasury").update({ permissions: junk });

    const preview = await invoke({ dryRun: true }, ["Admin"]);
    if (preview.dryRun) {
      expect(preview.preview).toContainEqual({
        id: "Treasury",
        current: junk,
        proposed: BUILT_IN_ROLE_PERMS.Treasury,
      });
    }

    const result = await invoke({ confirm: CONFIRM }, ["Admin"]);
    expect(result.applied).toContainEqual({ id: "Treasury", changedFields: ["permissions"] });
    expect((await db.doc("roles/Treasury").get()).get("permissions")).toEqual(
      BUILT_IN_ROLE_PERMS.Treasury,
    );
  });

  it("skips the locked Admin doc even on a real run", async () => {
    await db.doc("roles/Admin").update({ permissions: ["read:Member"] });
    const result = await invoke({ confirm: CONFIRM }, ["Admin"]);
    expect(result.skipped).toContainEqual({ id: "Admin", reason: "locked" });
    expect((await db.doc("roles/Admin").get()).get("permissions")).toEqual(["read:Member"]);
  });

  it("reports a missing doc as failed with ok:false instead of creating it", async () => {
    await db.doc("roles/Secretary").delete();
    const result = await invoke({ confirm: CONFIRM }, ["Admin"]);
    expect(result.ok).toBe(false);
    expect(result.failed).toEqual(["Secretary"]);
    expect((await db.doc("roles/Secretary").get()).exists).toBe(false);
  });

  it("BLOCKING: logs nothing when the commit throws", async () => {
    // Cloud Logging is the only place an operator sees what this callable did. Logging the
    // plan BEFORE the commit left a permanent record of changes that never landed.
    await driftTreasury();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(db, "batch").mockReturnValue({
      update: vi.fn(),
      commit: vi.fn().mockRejectedValue(new Error("commit failed")),
    } as unknown as WriteBatch);

    await expect(invoke({ confirm: CONFIRM }, ["Admin"])).rejects.toThrow(/commit failed/);
    expect(info).not.toHaveBeenCalled();
  });

  it("logs the applied ids once the commit lands", async () => {
    await driftTreasury();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await invoke({ confirm: CONFIRM }, ["Admin"]);
    expect(info).toHaveBeenCalledWith(
      "reseedBuiltInRolePerms",
      expect.objectContaining({ by: "caller-uid", applied: ["Treasury"] }),
    );
  });
});
