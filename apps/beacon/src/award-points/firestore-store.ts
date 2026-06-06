import { FieldValue, type Firestore, type Timestamp } from "firebase-admin/firestore";
import {
  ACTIVITY_CATEGORIES,
  type PointRuleCode,
  type InitiativeKind,
  type Participation,
} from "@luminova/types/engine";
import type { EngineStore } from "./store.js";
import type { ActivityRef } from "./derive.js";
import type { AggregateRow, MemberAggregate } from "./aggregate.js";

function hasToMillis(value: unknown): value is Timestamp {
  return typeof (value as { toMillis?: unknown })?.toMillis === "function";
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
    async getConfirmedRows(memberId, termId): Promise<AggregateRow[]> {
      const snap = await db
        .collection("participations")
        .where("memberId", "==", memberId)
        .where("termId", "==", termId)
        .where("state", "==", "confirmed")
        .get();
      return snap.docs.map((doc) => {
        const d = doc.data() as AggregateRow;
        return { computedPoints: d.computedPoints, monthBucket: d.monthBucket, state: d.state };
      });
    },
    async getRowsByParent(parentId): Promise<Participation[]> {
      const snap = await db.collection("participations").where("parentId", "==", parentId).get();
      return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<Participation, "id">) }));
    },
    async setMemberAggregate(memberId, termId, aggregate: MemberAggregate) {
      // Keyed by member AND term — the competition resets each gestión, so a member
      // has one aggregate doc per term (never clobber a prior term's totals).
      await db
        .doc(`memberPoints/${memberId}__${termId}`)
        .set({ memberId, termId, ...aggregate, updatedAt: FieldValue.serverTimestamp() });
      await db
        .doc(`members/${memberId}`)
        .set({ totalPoints: aggregate.cumulative }, { merge: true });
    },
  };
}
