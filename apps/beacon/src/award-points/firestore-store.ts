import { type Firestore, type Timestamp } from "firebase-admin/firestore";
import type { PointRuleCode, InitiativeKind, Participation } from "@luminova/types/engine";
import type { EngineStore } from "./store.js";
import type { ActivityRef } from "./derive.js";
import type { AggregateRow, MemberAggregate } from "./aggregate.js";

export function createFirestoreStore(db: Firestore): EngineStore {
  return {
    async getActivity(activityId) {
      const snap = await db.doc(`activities/${activityId}`).get();
      if (!snap.exists) return null;
      const d = snap.data() as Omit<ActivityRef, "id">;
      return {
        id: snap.id,
        termId: d.termId,
        category: d.category,
        parentType: d.parentType,
        parentId: d.parentId,
        startAt: d.startAt as Timestamp,
      };
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
      await db.doc(`memberPoints/${memberId}`).set({ termId, ...aggregate, updatedAt: new Date() });
      await db
        .doc(`members/${memberId}`)
        .set({ totalPoints: aggregate.cumulative }, { merge: true });
    },
  };
}
