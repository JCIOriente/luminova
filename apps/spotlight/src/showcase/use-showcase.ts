import type { ShowcaseItem } from "@luminova/types/engine";
import { useAsync, type Async } from "../lib/use-async";
import { fetchFeatured, fetchShowcaseItem, fetchShowcaseList } from "./showcase-firestore";

export function useShowcaseList(): Async<ShowcaseItem[]> {
  return useAsync(fetchShowcaseList, [] as ShowcaseItem[], []);
}

export function useFeaturedList(): Async<ShowcaseItem[]> {
  return useAsync(fetchFeatured, [] as ShowcaseItem[], []);
}

export function useShowcaseItem(id: string): Async<ShowcaseItem | null> {
  return useAsync(() => fetchShowcaseItem(id), null as ShowcaseItem | null, [id]);
}
