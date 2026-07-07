import type { AllyShowcaseItem } from "@luminova/types/engine";
import { makeResourceCache } from "../lib/cached-resource";
import { useCachedAsyncOnVisible } from "../lib/use-cached-async";
import type { AsyncOnVisible } from "../lib/use-async-on-visible";
import { fetchAllies } from "./ally-showcase-firestore";

// AllyShowcaseItem is Timestamp-free → identity cache (no serialize/revive).
const alliesCache = makeResourceCache<AllyShowcaseItem[]>({ key: "jci.allyShowcase.v1" });

const EMPTY: AllyShowcaseItem[] = [];

export function useAlliesOnVisible(): AsyncOnVisible<AllyShowcaseItem[]> {
  return useCachedAsyncOnVisible(alliesCache, fetchAllies, EMPTY, "allies");
}
