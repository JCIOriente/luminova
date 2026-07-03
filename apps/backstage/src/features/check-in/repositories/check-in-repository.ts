import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { getFirebase } from "@luminova/firebase";
import { checkInSchema, type CheckInInput } from "@luminova/types";
import type { ParticipationRole } from "@luminova/types/engine";
import { parseDocs } from "../../../lib/firestore-read";
import type { CheckInRecord } from "../roster";
import { checkInRecordDocSchema } from "./check-in-record-schema";

function checkInId(activityId: string, memberId: string, role: ParticipationRole): string {
  return `${activityId}__${memberId}__${role}`;
}

export class CheckInRepository {
  private readonly db = getFirebase().db;
  private readonly collection = collection(this.db, "checkIns");

  /** Roster for an activity (who has checked in). */
  async getByActivity(activityId: string): Promise<CheckInRecord[]> {
    const snapshot = await getDocs(query(this.collection, where("activityId", "==", activityId)));
    return parseDocs(checkInRecordDocSchema, snapshot);
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
