import { doc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { getDb } from "@luminova/firebase/db";

/** A member's registered push tokens at `members/{uid}/fcmTokens/{token}`. `uid` is
 *  the member's Auth uid, `token` the FCM registration token. No `firebase/messaging`
 *  import here — kept out of this repository so it never drags the messaging SDK into
 *  an eager path. */
export class FcmTokenRepository {
  constructor(private uid: string) {}

  private path(token: string): string {
    return `members/${this.uid}/fcmTokens/${token}`;
  }

  async add(token: string): Promise<void> {
    await setDoc(doc(getDb(), this.path(token)), { createdAt: serverTimestamp() });
  }

  async remove(token: string): Promise<void> {
    await deleteDoc(doc(getDb(), this.path(token)));
  }
}
