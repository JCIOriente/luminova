import { collection, doc, getDocs, limit, orderBy, query, updateDoc } from "firebase/firestore";
import { getDb } from "@luminova/firebase/db";
import { inboxDocSchema, type InboxDoc } from "@luminova/types";
import { parseDocs } from "../../../lib/firestore-read";

// Bound the read: newest 50 inbox copies. Ordering server-side means the cap drops
// the OLDEST notices, not arbitrary doc-ID ones. An inbox is per-member and the bell
// only surfaces recent notices, so 50 is ample; revisit with pagination if needed.
const INBOX_READ_CAP = 50;

/** A member's own in-app inbox at `members/{uid}/notifications`. Owner-scoped: the
 *  rules authorize `read: auth.uid == memberId` and allow the owner to flip only the
 *  boolean `read` field (see `INBOX_MUTABLE_FIELDS`). `uid` is the member's Auth uid. */
export class InboxRepository {
  constructor(private uid: string) {}

  private get collectionPath(): string {
    return `members/${this.uid}/notifications`;
  }

  /** Inbox copies, newest first, capped at `INBOX_READ_CAP`. */
  async list(): Promise<InboxDoc[]> {
    const snapshot = await getDocs(
      query(
        collection(getDb(), this.collectionPath),
        orderBy("createdAt", "desc"),
        limit(INBOX_READ_CAP),
      ),
    );
    return parseDocs(inboxDocSchema, snapshot);
  }

  /** Flip `read` to true — the only field the rules let the owner mutate. */
  async markRead(id: string): Promise<void> {
    await updateDoc(doc(getDb(), this.collectionPath, id), { read: true });
  }
}
