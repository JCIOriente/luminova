import { doc, getDoc } from "firebase/firestore/lite";
import { getFirestoreLite } from "@luminova/firebase/lite";
import type { MemberShowcaseItem } from "@luminova/types/engine";

/** Null is a real answer: the member opted out, or never had a public profile. */
export async function fetchMember(id: string): Promise<MemberShowcaseItem | null> {
  const snap = await getDoc(doc(getFirestoreLite(), "memberShowcase", id));
  // Trusted source: memberShowcase is written only by beacon (projectMember) and is
  // world-read/no-PII — same as the boardShowcase reader. The cast is safe.
  return snap.exists() ? (snap.data() as MemberShowcaseItem) : null;
}
