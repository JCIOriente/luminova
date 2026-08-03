import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { ROLES } from "@luminova/auth/roles";
import { BUILT_IN_ROLE_PERMS } from "@luminova/types/role-definition";
import type { PermissionCode } from "@luminova/types/permission";
import { requireAdmin } from "./callable-auth.js";
import { firestoreClaimsDeps } from "./claims-sync/firestore-deps.js";
import { syncMemberClaims } from "./claims-sync/sync.js";
import { parseMember, MEMBER_SYNC_FIELDS } from "./claims-sync/parse-member.js";
import { seedBuiltInRoles } from "./seed-roles.js";
import { ensureApp, currentTermKey } from "./runtime.js";

/** Admin-only: seed the built-in role docs (idempotent). Run once at rollout. */
export const seedRoles = onCall(async (request) => {
  requireAdmin(request);
  ensureApp();
  const created = await seedBuiltInRoles(getFirestore());
  return { ok: true as const, created };
});

/** Admin-only: recompute every provisioned member's custom claims, populating the
 *  `perms` claim. Run after seedRoles and BEFORE deploying the perm-based rules
 *  (so no member is left without perms when the rules start gating on them).
 *  Per-member errors are collected, not thrown, so one bad member can't abort the
 *  whole backfill; a long timeout covers a large collection. */
export const recomputeAllClaims = onCall(
  { timeoutSeconds: 540, memory: "512MiB" },
  async (request) => {
    requireAdmin(request);
    ensureApp();
    const db = getFirestore();
    const deps = firestoreClaimsDeps(db, getAuth());
    const termKey = currentTermKey();
    const snap = await db
      .collection("members")
      .select(...MEMBER_SYNC_FIELDS)
      .get();
    let synced = 0;
    const failed: string[] = [];
    for (const doc of snap.docs) {
      const member = parseMember(doc.data());
      if (!member.uid) continue;
      try {
        await syncMemberClaims(deps, member, termKey);
        synced += 1;
      } catch (err) {
        console.error("recomputeAllClaims member failed", { memberId: doc.id, err });
        failed.push(doc.id);
      }
    }
    return { ok: true as const, synced, failed };
  },
);

const RESEED_CONFIRM = "overwrite-builtin-roles";

export interface RoleSnapshot {
  id: string;
  exists: boolean;
  builtInKey: string | null;
  locked: boolean;
  permissions: PermissionCode[];
}

export interface ReseedPlan {
  applied: { id: string; changedFields: string[]; proposed: PermissionCode[] }[];
  /** `missing` means the doc does not exist. `update()` on a missing doc aborts the WHOLE
   *  batch, so those ids are excluded from the write and surfaced here instead — a reseed
   *  never CREATES. Fix by running `seedRoles` first. */
  skipped: { id: string; reason: "locked" | "unchanged" | "not-built-in" | "missing" }[];
  /** Operator shorthand: exactly the ids whose skip reason is `missing`, so the two-step
   *  `seedRoles` → reseed sequence is visible without reading every skip row. */
  failed: string[];
}

/** Order-insensitive set compare. `permissions` is an unordered capability set, so a
 *  reordered array is NOT a change — writing it would fire onRoleWritten and re-scan the
 *  entire members collection for nothing. Multiset-safe: compares deduped sizes too, so a
 *  doc carrying a duplicate code is correctly seen as different. */
function permsEqual(a: readonly PermissionCode[], b: readonly PermissionCode[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  if (a.length !== b.length || left.size !== right.size) return false;
  for (const code of left) if (!right.has(code)) return false;
  return true;
}

/** Pure: decide what a reseed would do, given the current role docs. Writes `permissions`
 *  ONLY — never `name`, never `description`. The doc owns display text, which is precisely
 *  what lets this coexist with role renaming: an operator re-running the reseed must not
 *  silently revert every rename. */
export function planRolePermReseed(snapshots: readonly RoleSnapshot[]): ReseedPlan {
  const plan: ReseedPlan = { applied: [], skipped: [], failed: [] };
  for (const snapshot of snapshots) {
    const proposed = BUILT_IN_ROLE_PERMS[snapshot.id as keyof typeof BUILT_IN_ROLE_PERMS];
    if (!proposed) continue;
    if (!snapshot.exists) {
      plan.skipped.push({ id: snapshot.id, reason: "missing" });
      plan.failed.push(snapshot.id);
      continue;
    }
    if (snapshot.builtInKey !== snapshot.id) {
      plan.skipped.push({ id: snapshot.id, reason: "not-built-in" });
      continue;
    }
    if (snapshot.locked) {
      plan.skipped.push({ id: snapshot.id, reason: "locked" });
      continue;
    }
    if (permsEqual(snapshot.permissions, proposed)) {
      plan.skipped.push({ id: snapshot.id, reason: "unchanged" });
      continue;
    }
    plan.applied.push({ id: snapshot.id, changedFields: ["permissions"], proposed });
  }
  return plan;
}

/** Admin-only: move the LIVE built-in role docs onto the current BUILT_IN_ROLE_PERMS
 *  snapshot. `seedRoles` uses create() and swallows ALREADY_EXISTS by design, so editing
 *  the snapshot alone never reaches production — this is the path that does.
 *
 *  UPDATE-ONLY, so it never creates a missing doc: a role key added to ROLES needs
 *  `seedRoles` FIRST, then this. Skipping that order leaves the new role permanently
 *  unsynced. Missing docs come back as `skipped` reason `missing` (and in `failed`).
 *
 *  Destructive, so it takes an explicit `confirm` beyond requireAdmin (the same gate the
 *  read-only admin ops use). Supports `dryRun`, which writes nothing and returns the
 *  per-doc before/after.
 *
 *  ONE WriteBatch: the doc-by-doc loop `seedRoles` uses would leave half the role set on
 *  new perms and half on old, with onRoleWritten fan-outs already fired for the first half
 *  and no rollback.
 *
 *  BLAST RADIUS — read apps/beacon/CLAUDE.md before running this in production.
 *  Every applied doc fires onRoleWritten, which scans the ENTIRE members collection for
 *  docs carrying a builtInKey. Run recomputeAllClaims afterwards as the observable backstop. */
export const reseedBuiltInRolePerms = onCall(
  { timeoutSeconds: 120, memory: "512MiB" },
  async (request) => {
    requireAdmin(request);
    const data = (request.data ?? {}) as { confirm?: unknown; dryRun?: unknown };
    const dryRun = data.dryRun === true;
    if (!dryRun && data.confirm !== RESEED_CONFIRM) {
      throw new HttpsError("invalid-argument", `confirm must be "${RESEED_CONFIRM}"`);
    }
    ensureApp();
    const db = getFirestore();
    // Bounded by ROLES.length (9) — no chunk() needed, and asserted by the unit test.
    const roleIds: string[] = [...ROLES];
    const snaps = await db.getAll(...roleIds.map((role) => db.doc(`roles/${role}`)));
    const snapshots: RoleSnapshot[] = snaps.map((snap, index) => ({
      id: roleIds[index] ?? snap.id,
      exists: snap.exists,
      builtInKey: typeof snap.get("builtInKey") === "string" ? snap.get("builtInKey") : null,
      locked: snap.get("locked") === true,
      permissions: (snap.get("permissions") ?? []) as PermissionCode[],
    }));
    const plan = planRolePermReseed(snapshots);

    if (dryRun) {
      return {
        ok: true as const,
        dryRun: true as const,
        preview: plan.applied.map((entry) => ({
          id: entry.id,
          current: snapshots.find((s) => s.id === entry.id)?.permissions ?? [],
          proposed: entry.proposed,
        })),
        applied: [],
        skipped: plan.skipped,
        failed: plan.failed,
      };
    }

    const batch = db.batch();
    for (const entry of plan.applied) {
      // update(), not set(): a missing doc must fail loudly rather than be created with a
      // partial shape. plan.skipped/failed already exclude them from the batch.
      batch.update(db.doc(`roles/${entry.id}`), { permissions: entry.proposed });
    }
    if (plan.applied.length > 0) await batch.commit();

    return {
      ok: true as const,
      dryRun: false as const,
      applied: plan.applied.map(({ id, changedFields }) => ({ id, changedFields })),
      skipped: plan.skipped,
      failed: plan.failed,
    };
  },
);
