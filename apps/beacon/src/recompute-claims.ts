import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { ROLES } from "@luminova/auth/roles";
import { BUILT_IN_ROLE_PERMS } from "@luminova/types/role-definition";
import type { PermissionCode } from "@luminova/types/permission";
import { requireAdmin } from "./callable-auth.js";
import {
  isActiveRoleDoc,
  permsFromRoleDoc,
  rawPermsFromRoleDoc,
  roleDocPermsMalformed,
} from "./claims-sync/role-doc.js";
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

export interface RecomputeClaimsResult {
  /** TRUE ONLY WHEN `failed` IS EMPTY. This callable IS the designated backstop for a partial
   *  `onRoleWritten` fan-out (apps/beacon/CLAUDE.md, BLAST RADIUS), so an unconditional
   *  `ok: true` beside a non-empty `failed` would report the backstop as having succeeded at
   *  exactly the moment members are still stranded — the same reason
   *  `reseedBuiltInRolePerms` does not return one either.
   *
   *  Deliberately NOT affected by a stale-role-snapshot warning: `ok` is a statement about
   *  per-member sync failures only. Staleness is logged and the response says nothing about
   *  it, because re-running is the response to both and `ok` must keep one meaning. */
  ok: boolean;
  /** Members whose claims were recomputed (provisioned members only — an unprovisioned
   *  member doc has no uid and is skipped without counting). */
  synced: number;
  /** Member doc ids whose sync threw. Collected, never thrown, so one bad member cannot
   *  abort the whole backfill. */
  failed: string[];
}

/** Pure: the callable's response contract, extracted so it is pinned by a test rather than
 *  resting on a human reading the response — there is no in-repo caller. Mirrors
 *  `planRolePermReseed` below (pure decision, impure glue). */
export function recomputeClaimsResult(
  synced: number,
  failed: readonly string[],
): RecomputeClaimsResult {
  return { ok: failed.length === 0, synced, failed: [...failed] };
}

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
    // This callable holds ONE deps instance — and therefore one memoized built-in role
    // snapshot — for up to 540 s, exactly like onRoleWritten. Being the designated backstop
    // makes the check matter MORE here, not less: if the backstop itself ran on a stale
    // snapshot, the operator's response to the trigger's own stale-snapshot line would be a
    // silent no-op. Logged, deliberately NOT folded into `ok`, which stays a pure statement
    // about per-member failures (see the return contract in apps/beacon/CLAUDE.md).
    const staleRoleKeys = await deps.staleBuiltInRoleKeys();
    if (staleRoleKeys.length > 0) {
      console.error("recomputeAllClaims ran on a stale role snapshot — run it again", {
        staleRoleKeys,
        synced,
      });
    }
    // Contract lives in recomputeClaimsResult (pinned by recompute-claims.test.ts) and is
    // documented beside the operator sequence in apps/beacon/CLAUDE.md.
    return recomputeClaimsResult(synced, failed);
  },
);

const RESEED_CONFIRM = "overwrite-builtin-roles";

export interface RoleSnapshot {
  id: string;
  exists: boolean;
  builtInKey: string | null;
  /** The doc's `builtIn === true`. Carried ONLY for the coverage report: the reseed itself
   *  decides built-in-ness from `builtInKey === id`, but the claims pipeline's
   *  `where("builtInKey","in",keys)` query ALSO requires `builtIn === true`, and this
   *  callable is the only code that reads all nine docs by id and can therefore see a doc
   *  the claims query structurally cannot. */
  builtIn: boolean;
  locked: boolean;
  /** `active !== false` and no `deletedAt`. A soft-deleted built-in must not be revived by
   *  a reseed — and the write would fire onRoleWritten across every member for a role
   *  nobody is supposed to hold. */
  active: boolean;
  /** EXACTLY what the doc holds, junk included. Carried alongside the sanitized view
   *  because they answer different questions: `permissions` decides what the claims
   *  pipeline would mint, `rawPermissions` is what is on disk. Reporting the sanitized
   *  array as `current` described a document state that does not exist. */
  rawPermissions: unknown[];
  /** `rawPermissions` minus everything `isValidPermissionCode` rejects. */
  permissions: PermissionCode[];
  /** The two above disagree — see `roleDocPermsMalformed`. Such a doc must be rewritten
   *  even when its sanitized set already matches the snapshot, or the junk is never
   *  normalized and it is indistinguishable from an up-to-date doc. */
  malformedPermissions: boolean;
}

export interface ReseedPlan {
  applied: { id: string; changedFields: string[]; proposed: PermissionCode[] }[];
  /** `missing` means the doc does not exist. `update()` on a missing doc aborts the WHOLE
   *  batch, so those ids are excluded from the write and surfaced here instead — a reseed
   *  never CREATES. Fix by running `seedRoles` first. */
  skipped: {
    id: string;
    reason: "locked" | "unchanged" | "not-built-in" | "missing" | "inactive";
  }[];
  /** Operator shorthand: exactly the ids whose skip reason is `missing`, so the two-step
   *  `seedRoles` → reseed sequence is visible without reading every skip row. */
  failed: string[];
  /** The anomaly class the claims-sync logs structurally CANNOT see, which is why it is
   *  reported here. Those logs only inspect docs the `where("builtInKey","in",keys)` query
   *  MATCHED; a doc whose `builtInKey` is absent or mis-cased never matches, and one missing
   *  `builtIn: true` is dropped — so its key stays uncovered, `resolveMemberPerms` re-mints
   *  BUILT_IN_ROLE_PERMS[key] through the fallback, and deactivating that role is a SILENT
   *  NO-OP that `/permisos` still reports as a revocation. Nothing anywhere logged it.
   *
   *  This callable is the one place that can see it: it reads all nine `roles/{key}` docs BY
   *  ID, so a doc is visible to it whatever its `builtInKey` says. Reported, not `failed`:
   *  `failed` is the documented shorthand for exactly the `missing` ids (run `seedRoles`),
   *  and these need a console field edit instead. This is deploy-check 3 of
   *  docs/specs/role-lifecycle.md, as a signal rather than as prose. */
  coverageAnomalies: {
    id: string;
    builtIn: boolean;
    builtInKey: string | null;
    /** `not-marked-built-in` — `builtIn !== true`, so the claims query DROPS it.
     *  `built-in-key-missing` — no `builtInKey`, so the claims query never MATCHES it.
     *  `built-in-key-mismatch` — `builtInKey` present but not this doc's id (a mis-case, or
     *  pointing at another key); this doc's own key goes uncovered either way. */
    problem: "not-marked-built-in" | "built-in-key-missing" | "built-in-key-mismatch";
  }[];
}

/** Every way an existing `roles/{ROLES key}` doc can fail to cover its own key in the claims
 *  pipeline. Independent of the skip/apply decision below on purpose: a `locked` or `inactive`
 *  doc missing `builtIn: true` is exactly as invisible to the claims query as an applied one,
 *  so the report must not be gated on the doc being writable. */
function coverageAnomaliesFor(snapshot: RoleSnapshot): ReseedPlan["coverageAnomalies"] {
  // A doc that does not exist is already `missing` + `failed`; reporting it here too would
  // just double the row an operator has to reconcile.
  if (!snapshot.exists) return [];
  const row = { id: snapshot.id, builtIn: snapshot.builtIn, builtInKey: snapshot.builtInKey };
  const out: ReseedPlan["coverageAnomalies"] = [];
  if (!snapshot.builtIn) out.push({ ...row, problem: "not-marked-built-in" });
  if (snapshot.builtInKey === null) out.push({ ...row, problem: "built-in-key-missing" });
  else if (snapshot.builtInKey !== snapshot.id)
    out.push({ ...row, problem: "built-in-key-mismatch" });
  return out;
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
  const plan: ReseedPlan = { applied: [], skipped: [], failed: [], coverageAnomalies: [] };
  for (const snapshot of snapshots) {
    const proposed = BUILT_IN_ROLE_PERMS[snapshot.id as keyof typeof BUILT_IN_ROLE_PERMS];
    if (!proposed) continue;
    plan.coverageAnomalies.push(...coverageAnomaliesFor(snapshot));
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
    if (!snapshot.active) {
      plan.skipped.push({ id: snapshot.id, reason: "inactive" });
      continue;
    }
    // Compare on the SANITIZED set but let a malformed doc through anyway. A console-edited
    // `["read:Member","manage:Evrything"]` sanitizes to a set equal to the snapshot, so a
    // sanitized-only comparison reported `unchanged`, left the junk on disk forever, and
    // was the one case an operator could not tell apart from a genuinely up-to-date doc.
    if (!snapshot.malformedPermissions && permsEqual(snapshot.permissions, proposed)) {
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
 *  Also the ONLY place the `coverageAnomalies` class is detectable — this callable reads all
 *  nine docs BY ID, so it sees the doc a mis-keyed `builtInKey` hides from the claims
 *  pipeline's field query entirely. Run it `dryRun: true` as deploy-check 3.
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
    // Bounded by ROLES.length (9), well under the 300 chunk() convention — the unit test
    // pins it against the 500 WriteBatch limit that the commit below actually depends on.
    const roleIds: string[] = [...ROLES];
    const snaps = await db.getAll(...roleIds.map((role) => db.doc(`roles/${role}`)));
    const snapshots: RoleSnapshot[] = snaps.map((snap, index) => {
      const data = snap.data();
      return {
        id: roleIds[index] ?? snap.id,
        exists: snap.exists,
        builtInKey: typeof snap.get("builtInKey") === "string" ? snap.get("builtInKey") : null,
        builtIn: snap.get("builtIn") === true,
        locked: snap.get("locked") === true,
        active: isActiveRoleDoc(data),
        rawPermissions: rawPermsFromRoleDoc(data),
        // permsFromRoleDoc, not a cast: a console-edited doc whose `permissions` is not an
        // array would make the Set construction in permsEqual throw and abort the reseed.
        permissions: permsFromRoleDoc(data),
        malformedPermissions: roleDocPermsMalformed(data),
      };
    });
    const plan = planRolePermReseed(snapshots);

    if (dryRun) {
      return {
        ok: plan.failed.length === 0,
        dryRun: true as const,
        // `current` is the RAW array — what is actually on disk. Reporting the sanitized
        // view here described a document state that does not exist, which is exactly the
        // case (a doc carrying an invalid code) the operator most needs to see.
        preview: plan.applied.map((entry) => ({
          id: entry.id,
          current: snapshots.find((s) => s.id === entry.id)?.rawPermissions ?? [],
          proposed: entry.proposed,
        })),
        applied: [],
        skipped: plan.skipped,
        failed: plan.failed,
        coverageAnomalies: plan.coverageAnomalies,
      };
    }

    const batch = db.batch();
    for (const entry of plan.applied) {
      // update(), not set(): a missing doc must fail loudly rather than be created with a
      // partial shape. plan.skipped/failed already exclude them from the batch.
      batch.update(db.doc(`roles/${entry.id}`), { permissions: entry.proposed });
    }
    if (plan.applied.length > 0) await batch.commit();

    // AFTER the commit, never before. Cloud Logging is the only place an operator sees what
    // this callable did; logging the plan first meant a throwing commit left a permanent
    // record of changes that never landed.
    console.info("reseedBuiltInRolePerms", {
      by: request.auth?.uid,
      applied: plan.applied.map((entry) => entry.id),
      skipped: plan.skipped,
      coverageAnomalies: plan.coverageAnomalies,
    });

    // NOT unconditionally true: the documented #1 operator error — running this before
    // seedRoles, so a newly added role has no doc to update — lands entirely in `failed`,
    // and an `ok: true` there would read as success to anything scripting on it.
    return {
      ok: plan.failed.length === 0,
      dryRun: false as const,
      applied: plan.applied.map(({ id, changedFields }) => ({ id, changedFields })),
      skipped: plan.skipped,
      failed: plan.failed,
      coverageAnomalies: plan.coverageAnomalies,
    };
  },
);
