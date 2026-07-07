import type { ShowcaseItem } from "@luminova/types/engine";
import { useAsync, type Async } from "../lib/use-async";
import { useCachedAsync, useCachedAsyncOnVisible } from "../lib/use-cached-async";
import type { AsyncOnVisible } from "../lib/use-async-on-visible";
import {
  fetchFeatured,
  fetchShowcaseItem,
  fetchShowcaseList,
  featuredCache,
  showcaseListCache,
} from "./showcase-firestore";

const EMPTY: ShowcaseItem[] = [];

export function useShowcaseList(): Async<ShowcaseItem[]> {
  return useCachedAsync(showcaseListCache, fetchShowcaseList, EMPTY, "showcase");
}

export function useFeaturedList(): Async<ShowcaseItem[]> {
  return useCachedAsync(featuredCache, fetchFeatured, EMPTY, "featured");
}

export function useFeaturedListOnVisible(): AsyncOnVisible<ShowcaseItem[]> {
  return useCachedAsyncOnVisible(featuredCache, fetchFeatured, EMPTY, "featured");
}

export function useShowcaseItem(id: string): Async<ShowcaseItem | null> {
  return useAsync(() => fetchShowcaseItem(id), null as ShowcaseItem | null, [id]);
}
