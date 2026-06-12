import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { getFirebase } from "@luminova/firebase";
import type { ShowcaseItem } from "@luminova/types/engine";

export function sortByCompletedDesc(items: ShowcaseItem[]): ShowcaseItem[] {
  return [...items].sort((a, b) => b.completedAt.toMillis() - a.completedAt.toMillis());
}

export async function fetchShowcaseList(): Promise<ShowcaseItem[]> {
  const { db } = getFirebase();
  const snap = await getDocs(collection(db, "showcase"));
  const items = snap.docs.map((d) => d.data() as ShowcaseItem);
  return sortByCompletedDesc(items);
}

export async function fetchShowcaseItem(id: string): Promise<ShowcaseItem | null> {
  const { db } = getFirebase();
  const snap = await getDoc(doc(db, "showcase", id));
  return snap.exists() ? (snap.data() as ShowcaseItem) : null;
}
