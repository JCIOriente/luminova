import { collection, doc, getDoc, getDocs } from "firebase/firestore/lite";
import { getFirestoreLite } from "@luminova/firebase";
import type { ShowcaseItem } from "@luminova/types/engine";

export function sortByCompletedDesc(items: ShowcaseItem[]): ShowcaseItem[] {
  return [...items].sort((a, b) => b.completedAt.toMillis() - a.completedAt.toMillis());
}

/** Curated highlights for /programas: featured items only, newest completion first. */
export function selectFeatured(items: ShowcaseItem[]): ShowcaseItem[] {
  return sortByCompletedDesc(items.filter((it) => it.featured));
}

export async function fetchShowcaseList(): Promise<ShowcaseItem[]> {
  const db = getFirestoreLite();
  const snap = await getDocs(collection(db, "showcase"));
  const items = snap.docs.map((d) => d.data() as ShowcaseItem);
  return sortByCompletedDesc(items);
}

export async function fetchFeatured(): Promise<ShowcaseItem[]> {
  const db = getFirestoreLite();
  const snap = await getDocs(collection(db, "showcase"));
  const items = snap.docs.map((d) => d.data() as ShowcaseItem);
  return selectFeatured(items);
}

export async function fetchShowcaseItem(id: string): Promise<ShowcaseItem | null> {
  const db = getFirestoreLite();
  const snap = await getDoc(doc(db, "showcase", id));
  return snap.exists() ? (snap.data() as ShowcaseItem) : null;
}
