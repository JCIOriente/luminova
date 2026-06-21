import type { AllyShowcaseItem } from "@luminova/types/engine";
import { useAsync, type Async } from "../lib/use-async";
import { fetchAllies } from "./ally-showcase-firestore";

export function useAllies(): Async<AllyShowcaseItem[]> {
  return useAsync(fetchAllies, [] as AllyShowcaseItem[], []);
}
