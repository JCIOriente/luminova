import { collection, getDocs, query, where } from "firebase/firestore";
import { getFirebase } from "@luminova/firebase";
import type { Participation } from "@luminova/types/engine";
import { byMonthThenPoints } from "./participation-sort";

export class ParticipationRepository {
  private readonly collection = collection(getFirebase().db, "participations");

  /** A member's participation ledger for a term, newest month first. */
  async getByMemberAndTerm(memberId: string, termId: string): Promise<Participation[]> {
    const snapshot = await getDocs(
      query(this.collection, where("memberId", "==", memberId), where("termId", "==", termId)),
    );
    return snapshot.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Participation, "id">) }))
      .sort(byMonthThenPoints);
  }
}
