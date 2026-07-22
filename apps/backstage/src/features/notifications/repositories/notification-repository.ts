import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { getDb } from "@luminova/firebase/db";
import {
  notificationDocSchema,
  type NotificationCreate,
  type NotificationDoc,
} from "@luminova/types";
import { parseDocs } from "../../../lib/firestore-read";

// Bound the read: newest 200 composed notifications. Ordering server-side means the
// cap drops the OLDEST notices, not arbitrary doc-ID ones; revisit with pagination if
// the sent history ever nears the cap.
const NOTIFICATION_READ_CAP = 200;

export class NotificationRepository {
  private readonly collection = collection(getDb(), "notifications");

  /** Composed notifications, newest first. */
  async listSent(): Promise<NotificationDoc[]> {
    const snapshot = await getDocs(
      query(this.collection, orderBy("createdAt", "desc"), limit(NOTIFICATION_READ_CAP)),
    );
    return parseDocs(notificationDocSchema, snapshot);
  }

  /** Compose a notification — the doc-create triggers the beacon fan-out. `stats` is
   *  never client-set (the beacon writes it; the rules reject a client-set stats), and
   *  `createdAt` MUST be `serverTimestamp()` because the rules require
   *  `createdAt == request.time`. */
  async compose(input: NotificationCreate, uid: string): Promise<void> {
    await addDoc(this.collection, {
      ...input,
      createdBy: uid,
      createdAt: serverTimestamp(),
    });
  }
}
