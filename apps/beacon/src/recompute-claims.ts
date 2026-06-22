import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
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
