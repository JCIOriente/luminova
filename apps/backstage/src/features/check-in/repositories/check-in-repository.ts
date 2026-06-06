import {
  collection,
  doc,
  getDocs,
  setDoc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { getFirebase } from "@luminova/firebase";
import { checkInSchema, type CheckInInput } from "@luminova/types";
import type { CheckInRecord } from "../roster";

export class CheckInRepository {
  private readonly db = getFirebase().db;
  private readonly collection = collection(this.db, "checkIns");

  /** Roster for an activity (who has checked in). */
  async getByActivity(activityId: string): Promise<CheckInRecord[]> {
    const snapshot = await getDocs(query(this.collection, where("activityId", "==", activityId)));
    return snapshot.docs.map((d) => {
      const data = d.data() as { memberId: string; role: CheckInRecord["role"] };
      return { memberId: data.memberId, role: data.role };
    });
  }

  /** Write a check-in. Deterministic id (idempotent) + server timestamp. The
   *  repository is the authoritative validation boundary. */
  async create(input: CheckInInput): Promise<void> {
    const { memberId, activityId, role } = checkInSchema.parse(input);
    const id = `${activityId}__${memberId}__${role}`;
    await setDoc(doc(this.collection, id), {
      memberId,
      activityId,
      role,
      checkInAt: serverTimestamp(),
    });
  }
}
