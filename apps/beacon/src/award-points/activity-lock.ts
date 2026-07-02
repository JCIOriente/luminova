import type { Firestore } from "firebase-admin/firestore";

/**
 * Mirror "this activity has check-ins" onto the activity doc. firestore.rules
 * cannot query the checkIns collection, so it locks the point-bearing fields
 * (category/startAt/parentId/parentType) by reading `hasCheckIns` off
 * resource.data — this keeps that flag true to the ground truth.
 *
 * Recompute-from-count (never increment) keeps it idempotent under at-least-once
 * redelivery. The flag write is UNCONDITIONAL on purpose — it is the transaction's
 * write-write conflict anchor (same reasoning as recomputeAggregate's memberPoints
 * write): a skip-if-unchanged sync would commit read-only, so a racing sync with a
 * stale count (a count()==0 read locks no documents) could clobber a fresher value
 * and strand the flag on the wrong side. The resulting per-check-in activities
 * write does NOT amplify into showcase work: onActivityWritten short-circuits via
 * activityProjectionUnchanged (hasCheckIns is never projected).
 */
export async function syncActivityCheckInFlag(db: Firestore, activityId: string): Promise<void> {
  const ref = db.doc(`activities/${activityId}`);
  const countQuery = db.collection("checkIns").where("activityId", "==", activityId).count();
  await db.runTransaction(async (tx) => {
    const [snap, countSnap] = await Promise.all([tx.get(ref), tx.get(countQuery)]);
    if (!snap.exists) return; // activity gone — nothing to mirror
    tx.update(ref, { hasCheckIns: countSnap.data().count > 0 });
  });
}
