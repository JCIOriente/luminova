import { collection, getDocs } from "firebase/firestore/lite";
import { getFirestoreLite } from "@luminova/firebase/lite";
import type { AllyShowcaseItem } from "@luminova/types/engine";

export function sortByName(items: AllyShowcaseItem[]): AllyShowcaseItem[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export async function fetchAllies(): Promise<AllyShowcaseItem[]> {
  const db = getFirestoreLite();
  const snap = await getDocs(collection(db, "allyShowcase"));
  return sortByName(snap.docs.map((d) => d.data() as AllyShowcaseItem));
}
