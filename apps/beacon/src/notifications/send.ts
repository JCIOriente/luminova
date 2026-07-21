import type { Firestore, DocumentReference, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { chunk } from "../chunk.js";
import { hasToMillis } from "../firestore-util.js";
import { parseAudience, memberQueryFilter, includesAnonTokens, type Audience } from "./audience.js";

const READ_CHUNK = 300;
const MULTICAST_CAP = 500;
const WRITE_BATCH_CAP = 500;
const SCAN_CAP = 10000;
const DEAD_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-argument",
]);

export interface MulticastSender {
  sendEachForMulticast(message: {
    tokens: string[];
    notification: { title: string; body: string };
    data?: Record<string, string>;
  }): Promise<{ responses: { success: boolean; error?: { code?: string } }[] }>;
}

export interface NotificationInput {
  title: string;
  body: string;
  url: string | null;
  audience: unknown;
  createdAt: FirebaseFirestore.Timestamp;
}

interface TokenRef {
  token: string;
  ref: DocumentReference;
}

function warnIfCapped(size: number, cap: number, message: string): void {
  if (size === cap) console.error(message, { cap });
}

function toTokenRef(d: QueryDocumentSnapshot): TokenRef {
  return { token: d.id, ref: d.ref };
}

async function resolveMembers(db: Firestore, audience: Audience): Promise<string[]> {
  const filter = memberQueryFilter(audience);
  let query: FirebaseFirestore.Query = db.collection("members").select().limit(SCAN_CAP);
  if (filter) query = query.where(filter.field, filter.op, filter.value);
  const snap = await query.get();
  warnIfCapped(snap.size, SCAN_CAP, "notification member scan hit cap");
  return snap.docs.map((d) => d.id);
}

async function memberTokens(db: Firestore, memberIds: string[]): Promise<TokenRef[]> {
  const out: TokenRef[] = [];
  for (const batch of chunk(memberIds, READ_CHUNK)) {
    const snaps = await Promise.all(
      batch.map((id) => db.collection(`members/${id}/fcmTokens`).get()),
    );
    for (const snap of snaps) for (const d of snap.docs) out.push(toTokenRef(d));
  }
  return out;
}

async function anonTokens(db: Firestore): Promise<TokenRef[]> {
  const snap = await db.collection("pushTokens").limit(SCAN_CAP).get();
  warnIfCapped(snap.size, SCAN_CAP, "pushTokens scan hit cap — anon broadcast truncated");
  return snap.docs.map(toTokenRef);
}

async function fanOutInbox(
  db: Firestore,
  memberIds: string[],
  id: string,
  input: NotificationInput,
): Promise<void> {
  for (const batch of chunk(memberIds, WRITE_BATCH_CAP)) {
    const writer = db.batch();
    for (const memberId of batch) {
      writer.set(db.doc(`members/${memberId}/notifications/${id}`), {
        title: input.title,
        body: input.body,
        url: input.url,
        read: false,
        createdAt: input.createdAt,
      });
    }
    await writer.commit();
  }
}

async function pushAndPrune(
  sender: MulticastSender,
  tokens: TokenRef[],
  input: NotificationInput,
): Promise<{ pushSent: number; pushFailed: number }> {
  let pushSent = 0;
  let pushFailed = 0;
  for (const batch of chunk(tokens, MULTICAST_CAP)) {
    try {
      const res = await sender.sendEachForMulticast({
        tokens: batch.map((t) => t.token),
        notification: { title: input.title, body: input.body },
        data: input.url ? { url: input.url } : undefined,
      });
      await Promise.all(
        res.responses.map(async (r, i) => {
          if (r.success) {
            pushSent += 1;
            return;
          }
          pushFailed += 1;
          const dead = batch[i];
          if (dead && r.error?.code && DEAD_TOKEN_CODES.has(r.error.code)) {
            await dead.ref
              .delete()
              .catch((err) => console.error("dead token prune failed", { token: dead.token }, err));
          }
        }),
      );
    } catch (err) {
      console.error("notification push batch failed", err);
      pushFailed += batch.length;
    }
  }
  return { pushSent, pushFailed };
}

/** Fan out one composed notification: inbox copies to matching members + a
 *  best-effort FCM multicast, then write stats back. Never throws on push. */
export async function sendNotification(
  db: Firestore,
  sender: MulticastSender,
  id: string,
  input: NotificationInput,
): Promise<void> {
  const audience = parseAudience(input.audience);
  if (audience === null) {
    console.error("notification has malformed audience — skipping", { id });
    return;
  }
  if (
    typeof input.title !== "string" ||
    input.title.length === 0 ||
    input.title.length > 120 ||
    typeof input.body !== "string" ||
    input.body.length === 0 ||
    input.body.length > 1000 ||
    !hasToMillis(input.createdAt)
  ) {
    console.error("notification has malformed payload — skipping", { id });
    return;
  }
  try {
    const memberIds = await resolveMembers(db, audience);
    const [, memberTokenRefs, anonTokenRefs] = await Promise.all([
      fanOutInbox(db, memberIds, id, input),
      memberTokens(db, memberIds),
      includesAnonTokens(audience) ? anonTokens(db) : Promise.resolve([] as TokenRef[]),
    ]);
    const tokens = [...memberTokenRefs, ...anonTokenRefs];
    const stats =
      tokens.length > 0
        ? await pushAndPrune(sender, tokens, input)
        : { pushSent: 0, pushFailed: 0 };
    await db.doc(`notifications/${id}`).set({ stats }, { merge: true });
  } catch (err) {
    console.error("notification send failed", { id }, err);
  }
}
