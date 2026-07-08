import { FieldValue, type Firestore } from "firebase-admin/firestore";
import {
  ACTIVITY_CATEGORIES,
  type PointRuleCode,
  type InitiativeKind,
  type Participation,
} from "@luminova/types/engine";
import type { EngineStore, InitiativeWrite } from "./store.js";
import type { ActivityRef } from "./derive.js";
import { aggregateFromRows, type AggregateRow } from "./aggregate.js";
import { isCleanId } from "./ids.js";
import { hasToMillis } from "../firestore-util.js";

/**
 * Parse a programs/projects doc into the engine's InitiativeWrite, or null if
 * termId is malformed. Member ids that aren't path-safe (`/` or `__`) are dropped
 * — they would collide composite participation ids — so only clean roles expand.
 */
export function parseInitiativeWrite(data: unknown): InitiativeWrite | null {
  const raw = (data ?? {}) as Record<string, unknown>;
  if (!isCleanId(raw.termId)) return null;
  const termId = raw.termId;

  const r = (raw.roster ?? {}) as Record<string, unknown>;
  const directorId = isCleanId(r.directorId) ? r.directorId : "";
  const coDirectorIds = Array.isArray(r.coDirectorIds)
    ? [...new Set(r.coDirectorIds.filter(isCleanId))]
    : [];
  const teamIds = Array.isArray(r.teamIds) ? [...new Set(r.teamIds.filter(isCleanId))] : [];

  const finalReport = raw.finalReport as { filedAt?: unknown } | null | undefined;
  const reportFiled = finalReport != null;
  const filedAtMillis =
    reportFiled && hasToMillis(finalReport!.filedAt) ? finalReport!.filedAt.toMillis() : null;

  return { termId, roster: { directorId, coDirectorIds, teamIds }, reportFiled, filedAtMillis };
}

/** Parse a Firestore activity doc into an ActivityRef, or null if the required fields are malformed. */
function parseActivity(id: string, data: Record<string, unknown>): ActivityRef | null {
  const { termId, category, parentType, parentId, startAt } = data;
  if (typeof termId !== "string" || termId.length === 0) return null;
  if (!ACTIVITY_CATEGORIES.includes(category as ActivityRef["category"])) return null;
  if (parentType !== null && parentType !== "Program" && parentType !== "Project") return null;
  if (parentId !== null && typeof parentId !== "string") return null;
  if (!hasToMillis(startAt)) return null;
  return {
    id,
    termId,
    category: category as ActivityRef["category"],
    parentType: parentType as InitiativeKind | null,
    parentId: parentId as string | null,
    startAt,
  };
}

export function createFirestoreStore(db: Firestore): EngineStore {
  return {
    async getActivity(activityId) {
      const snap = await db.doc(`activities/${activityId}`).get();
      if (!snap.exists) return null;
      return parseActivity(snap.id, snap.data() as Record<string, unknown>);
    },
    async getPointRulePoints(termId, code: PointRuleCode) {
      const snap = await db.doc(`pointRules/${termId}__${code}`).get();
      if (!snap.exists) return null;
      const points = (snap.data() as { points?: unknown }).points;
      return typeof points === "number" ? points : null;
    },
    async isReportFiled(parentType: InitiativeKind, parentId) {
      const collection = parentType === "Program" ? "programs" : "projects";
      const snap = await db.doc(`${collection}/${parentId}`).get();
      return snap.exists && (snap.data() as { finalReport?: unknown }).finalReport != null;
    },
    async getParticipation(id): Promise<Participation | null> {
      const snap = await db.doc(`participations/${id}`).get();
      if (!snap.exists) return null;
      return { id: snap.id, ...(snap.data() as Omit<Participation, "id">) };
    },
    async setParticipation(row: Participation) {
      const { id, ...data } = row;
      await db.doc(`participations/${id}`).set(data);
    },
    async deleteParticipation(id) {
      await db.doc(`participations/${id}`).delete();
    },
    async getRowsByParent(parentId): Promise<Participation[]> {
      const snap = await db.collection("participations").where("parentId", "==", parentId).get();
      return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<Participation, "id">) }));
    },
    async recomputeAggregate(memberId, termId) {
      // Read the confirmed rows and write the aggregate in ONE transaction. The
      // query read is the transaction's read set, so a concurrent check-in that
      // adds/removes a matching row before commit forces a retry — and both
      // racing recomputes write the same memberPoints doc, so the loser aborts
      // and re-reads. A plain read-then-write here loses updates under concurrency.
      // memberPoints is keyed by member AND term: the competition resets each
      // gestión, so a member has one aggregate doc per term (never clobber a prior
      // term's totals).
      const rows = db
        .collection("participations")
        .where("memberId", "==", memberId)
        .where("termId", "==", termId)
        .where("state", "==", "confirmed");
      const memberPointsRef = db.doc(`memberPoints/${memberId}__${termId}`);
      const memberRef = db.doc(`members/${memberId}`);
      await db.runTransaction(async (tx) => {
        // Read the aggregate doc into the transaction's read set (value unused):
        // memberPoints is always written below, so this guarantees a write-write
        // conflict — and a retry that re-reads the rows — when two recomputes for
        // the same member+term race. Don't rely on query-read conflict detection
        // alone, and don't rely on the conditional members write below.
        await tx.get(memberPointsRef);
        const memberSnap = await tx.get(memberRef);
        const snap = await tx.get(rows);
        const aggregate = aggregateFromRows(
          snap.docs.map((doc) => {
            const d = doc.data() as AggregateRow;
            return { computedPoints: d.computedPoints, monthBucket: d.monthBucket, state: d.state };
          }),
        );
        tx.set(memberPointsRef, {
          memberId,
          termId,
          ...aggregate,
          updatedAt: FieldValue.serverTimestamp(),
        });
        // Mirror to members.totalPoints only when it actually changed: every
        // members write fires onMemberWritten (claims-sync), so an unconditional
        // write amplifies into a wasted claims sync on every recompute even when
        // the total is unchanged (report-gate reconcile, redelivery). Skip-if-equal
        // mirrors setInitiativeDirectionUids. memberRef is read inside the txn on
        // purpose (atomic decision); the only other writer of this doc is rare
        // admin edits, and claims-sync writes Auth, not Firestore — so no loop.
        // A missing or non-number value reads as undefined → differs → a corrective
        // numeric write lands (and preserves the prior create-on-write behavior);
        // otherwise a legacy non-number totalPoints would defeat the guard forever.
        const raw = memberSnap.exists
          ? (memberSnap.data() as { totalPoints?: unknown }).totalPoints
          : undefined;
        const currentTotal = typeof raw === "number" ? raw : undefined;
        if (currentTotal !== aggregate.cumulative) {
          tx.set(memberRef, { totalPoints: aggregate.cumulative }, { merge: true });
        }
      });
    },
    async getMemberUids(memberIds) {
      if (memberIds.length === 0) return [];
      const snaps = await db.getAll(...memberIds.map((id) => db.doc(`members/${id}`)));
      return snaps
        .map((snap) => (snap.exists ? (snap.data() as { uid?: unknown; active?: unknown }) : null))
        .filter(
          (data): data is { uid: string; active: true } =>
            data !== null &&
            data.active === true &&
            typeof data.uid === "string" &&
            data.uid.length > 0,
        )
        .map((data) => data.uid);
    },
    async setInitiativeDirectionUids(parentType, parentId, uids) {
      const collection = parentType === "Program" ? "programs" : "projects";
      const ref = db.doc(`${collection}/${parentId}`);
      const snap = await ref.get();
      if (!snap.exists) return; // deleted initiative — nothing to mirror
      const sorted = [...uids].sort();
      const current = (snap.data() as { directionUids?: unknown }).directionUids;
      const same =
        Array.isArray(current) &&
        current.length === sorted.length &&
        [...current].sort().every((v, i) => v === sorted[i]);
      if (same) return; // identical — break the write->trigger loop
      await ref.set({ directionUids: sorted }, { merge: true });
    },
  };
}
