import { collection, doc, getDocs, query, where, writeBatch, updateDoc } from "firebase/firestore";
import { getFirebase } from "@luminova/firebase";
import type { PointRule } from "@luminova/types";
import { toSeedRules, byMatrixOrder } from "./point-rule-mapper";

export class PointRuleRepository {
  private readonly db = getFirebase().db;
  private readonly collection = collection(this.db, "pointRules");

  /** Rules for a term, in matrix order. */
  async getAllByTerm(termId: string): Promise<PointRule[]> {
    const snapshot = await getDocs(query(this.collection, where("termId", "==", termId)));
    return snapshot.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<PointRule, "id">) }))
      .sort(byMatrixOrder);
  }

  /** Bootstrap the term doc (if missing) + the 16 rules. Idempotent (deterministic ids). */
  async seed(termId: string): Promise<void> {
    const batch = writeBatch(this.db);
    batch.set(
      doc(this.db, "terms", termId),
      {
        status: "Activo",
        conventionDate: null,
        pointsCutoffAt: null,
        board: [],
        bestMemberId: null,
      },
      { merge: true },
    );
    for (const rule of toSeedRules(termId)) {
      const { id, ...data } = rule;
      batch.set(doc(this.collection, id), data);
    }
    await batch.commit();
  }

  async updatePoints(id: string, points: number): Promise<void> {
    await updateDoc(doc(this.collection, id), { points });
  }
}
