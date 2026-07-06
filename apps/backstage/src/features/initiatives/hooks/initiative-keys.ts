import type { InitiativeCollection, InitiativeType } from "../lib/initiative-kind";

/**
 * Per-collection query-key factory. The `collection` string is the key HEAD so
 * `["programs", ...]` and `["projects", ...]` share no prefix — TanStack v5
 * prefix-match invalidation of one kind can never touch the other's cache.
 */
export const initiativeKeys = (collection: InitiativeCollection) => ({
  all: [collection] as const,
  byTerm: (termId: string) => [collection, "term", termId] as const,
});

/**
 * Detail-view cache key. Kept under its own `"initiatives"/"detail"` head keyed on
 * `type` — distinct namespace from `initiativeKeys` (list cache), and the `type`
 * segment isolates program vs project detail.
 */
export const initiativeDetailKey = (type: InitiativeType, id: string) =>
  ["initiatives", "detail", type, id] as const;
