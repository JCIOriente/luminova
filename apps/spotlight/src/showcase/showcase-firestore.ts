import { collection, doc, getDoc, getDocs, query, where, Timestamp } from "firebase/firestore/lite";
import { getFirestoreLite } from "@luminova/firebase/lite";
import { makeResourceCache } from "../lib/cached-resource";
import type { ShowcaseItem } from "@luminova/types/engine";

export function sortByCompletedDesc(items: ShowcaseItem[]): ShowcaseItem[] {
  return [...items].sort((a, b) => b.completedAt.toMillis() - a.completedAt.toMillis());
}

export async function fetchShowcaseList(): Promise<ShowcaseItem[]> {
  const db = getFirestoreLite();
  const snap = await getDocs(collection(db, "showcase"));
  return sortByCompletedDesc(snap.docs.map((d) => d.data() as ShowcaseItem));
}

/**
 * Curated highlights for /programas: only featured docs, filtered server-side so
 * we don't download the whole collection. `completedAt` sort stays client-side
 * (equality-only query → no composite index required).
 */
export async function fetchFeatured(): Promise<ShowcaseItem[]> {
  const db = getFirestoreLite();
  const snap = await getDocs(query(collection(db, "showcase"), where("featured", "==", true)));
  return sortByCompletedDesc(snap.docs.map((d) => d.data() as ShowcaseItem));
}

export async function fetchShowcaseItem(id: string): Promise<ShowcaseItem | null> {
  const db = getFirestoreLite();
  const snap = await getDoc(doc(db, "showcase", id));
  return snap.exists() ? (snap.data() as ShowcaseItem) : null;
}

// Firestore Timestamp JSON round-trip is version-fragile, so the cache stores
// millis and reconstructs Timestamps on read. Only the three top-level Timestamp
// fields need bridging; the rest of ShowcaseItem is JSON-safe.
type CachedShowcaseItem = Omit<ShowcaseItem, "startDate" | "endDate" | "completedAt"> & {
  startDate: number;
  endDate: number;
  completedAt: number;
};

function serializeShowcase(items: ShowcaseItem[]): CachedShowcaseItem[] {
  return items.map((it) => ({
    ...it,
    startDate: it.startDate.toMillis(),
    endDate: it.endDate.toMillis(),
    completedAt: it.completedAt.toMillis(),
  }));
}

function reviveShowcase(raw: unknown): ShowcaseItem[] {
  // raw is the JSON.parse output of a serializeShowcase array.
  const cached = raw as CachedShowcaseItem[];
  return cached.map((it) => ({
    ...it,
    startDate: Timestamp.fromMillis(it.startDate),
    endDate: Timestamp.fromMillis(it.endDate),
    completedAt: Timestamp.fromMillis(it.completedAt),
  }));
}

export const showcaseListCache = makeResourceCache<ShowcaseItem[]>({
  key: "jci.showcase.v1",
  serialize: serializeShowcase,
  revive: reviveShowcase,
});

export const featuredCache = makeResourceCache<ShowcaseItem[]>({
  key: "jci.showcase.featured.v1",
  serialize: serializeShowcase,
  revive: reviveShowcase,
});
