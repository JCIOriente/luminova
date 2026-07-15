import { collection, getDocs, query, where } from "firebase/firestore";
import { getDb } from "@luminova/firebase/db";
import { participationDocSchema, type Participation } from "@luminova/types/engine";
import { parseDocs } from "../../../lib/firestore-read";
import { byMonthThenPoints } from "./participation-sort";

export class ParticipationRepository {
  private readonly collection = collection(getDb(), "participations");

  /** A member's participation ledger for a term, newest month first. */
  async getByMemberAndTerm(memberId: string, termId: string): Promise<Participation[]> {
    const snapshot = await getDocs(
      query(this.collection, where("memberId", "==", memberId), where("termId", "==", termId)),
    );
    return parseDocs(participationDocSchema, snapshot).sort(byMonthThenPoints);
  }
}
