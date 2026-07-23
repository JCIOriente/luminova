import { collection, getDocs } from "firebase/firestore/lite";
import { getFirestoreLite } from "@luminova/firebase/lite";
import type { BoardShowcaseItem } from "@luminova/types/engine";

/** Statutory rank first (CEL 0..7, JDL 1000), then name for the JDL tie-break. */
export function sortByRank(items: BoardShowcaseItem[]): BoardShowcaseItem[] {
  return [...items].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, "es"));
}

export async function fetchBoard(): Promise<BoardShowcaseItem[]> {
  const db = getFirestoreLite();
  const snap = await getDocs(collection(db, "boardShowcase"));
  // Trusted source: boardShowcase is written only by beacon (admin SDK, projectBoard)
  // and is world-read/no-PII — same as the allyShowcase reader. The cast is safe.
  return sortByRank(snap.docs.map((d) => d.data() as BoardShowcaseItem));
}
