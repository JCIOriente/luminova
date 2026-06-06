import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { getFirebase } from "@luminova/firebase";
import type { MemberPoints } from "@luminova/types/engine";

export class MemberPointsRepository {
  private readonly db = getFirebase().db;

  /** The member's aggregate for a term, or null if none accrued yet. */
  async getByMemberAndTerm(memberId: string, termId: string): Promise<MemberPoints | null> {
    const snapshot = await getDoc(doc(this.db, "memberPoints", `${memberId}__${termId}`));
    if (!snapshot.exists()) return null;
    return { id: snapshot.id, ...(snapshot.data() as Omit<MemberPoints, "id">) };
  }

  /** Every member's aggregate for a term (drives the leaderboard). */
  async getAllByTerm(termId: string): Promise<MemberPoints[]> {
    const snapshot = await getDocs(
      query(collection(this.db, "memberPoints"), where("termId", "==", termId)),
    );
    return snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MemberPoints, "id">) }));
  }
}
