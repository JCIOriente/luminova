import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
  query,
  where,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore";
import { getFirebase } from "@luminova/firebase";
import { checkInSchema, type CheckInInput } from "@luminova/types";
import type { ParticipationRole } from "@luminova/types/engine";
import type { CheckInRecord } from "../roster";

function checkInId(activityId: string, memberId: string, role: ParticipationRole): string {
  return `${activityId}__${memberId}__${role}`;
}

export class CheckInRepository {
  private readonly db = getFirebase().db;
  private readonly collection = collection(this.db, "checkIns");

  /** Roster for an activity (who has checked in). */
  async getByActivity(activityId: string): Promise<CheckInRecord[]> {
    const snapshot = await getDocs(query(this.collection, where("activityId", "==", activityId)));
    return snapshot.docs.map((d) => {
      // Firestore doc shape; checkInAt is null only in the brief window before the
      // server timestamp resolves on a just-written row.
      const data = d.data() as {
        memberId: string;
        role: CheckInRecord["role"];
        checkInAt: Timestamp | null;
      };
      return { memberId: data.memberId, role: data.role, checkInAt: data.checkInAt ?? null };
    });
  }

  /** Write a check-in. Deterministic id (idempotent) + server timestamp. The
   *  repository is the authoritative validation boundary. */
  async create(input: CheckInInput): Promise<void> {
    const { memberId, activityId, role } = checkInSchema.parse(input);
    await setDoc(doc(this.collection, checkInId(activityId, memberId, role)), {
      memberId,
      activityId,
      role,
      checkInAt: serverTimestamp(),
    });
  }

  /** Undo a check-in (mis-scan correction). Deletes the deterministic-id doc;
   *  firestore.rules gate the delete by the same window + authority as create. */
  async remove(activityId: string, memberId: string, role: ParticipationRole): Promise<void> {
    await deleteDoc(doc(this.collection, checkInId(activityId, memberId, role)));
  }
}
