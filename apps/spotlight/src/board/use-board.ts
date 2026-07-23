import type { BoardShowcaseItem } from "@luminova/types/engine";
import { makeResourceCache } from "../lib/cached-resource";
import { useCachedAsyncOnVisible } from "../lib/use-cached-async";
import type { AsyncOnVisible } from "../lib/use-async-on-visible";
import { fetchBoard } from "./board-showcase-firestore";

// BoardShowcaseItem is Timestamp-free → identity cache (no serialize/revive).
const boardCache = makeResourceCache<BoardShowcaseItem[]>({ key: "jci.boardShowcase.v1" });

const EMPTY: BoardShowcaseItem[] = [];

export function useBoardOnVisible(): AsyncOnVisible<BoardShowcaseItem[]> {
  return useCachedAsyncOnVisible(boardCache, fetchBoard, EMPTY, "board");
}
