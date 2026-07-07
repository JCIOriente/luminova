import { useState } from "react";
import { useAsync, type Async } from "./use-async";
import { useAsyncOnVisible, type AsyncOnVisible } from "./use-async-on-visible";
import { withCache, type ResourceCache } from "./cached-resource";

// Read the cache exactly once per mount (useState's lazy initializer). A miss is
// a real null — our cached resources are always arrays, never null — so
// `cached === null` cleanly distinguishes a hit from a miss.
function useCachedSeed<T>(cache: ResourceCache<T>): T | null {
  const [seed] = useState(() => cache.read());
  return seed;
}

// Seed from the localStorage cache, revalidate via the given base hook, and — on
// a cache hit — suppress both the loading skeleton (instant paint) and a failed
// revalidation's error (stale-while-revalidate: keep the cached data on screen
// instead of clobbering it). On a miss both pass through as usual. useAsync
// retains the seed as its `data` on error, so the cached content stays rendered.
function useCached<T, S extends Async<T>>(
  useBase: (fetcher: () => Promise<T>, empty: T, deps: []) => S,
  cache: ResourceCache<T>,
  fetcher: () => Promise<T>,
  fallback: T,
  label: string,
): S {
  const cached = useCachedSeed(cache);
  const state = useBase(withCache(cache, fetcher, label), cached ?? fallback, []);
  const miss = cached === null;
  return { ...state, loading: state.loading && miss, error: state.error && miss };
}

/**
 * SWR over a public firestore-lite read: a cache hit paints instantly
 * (loading:false, no skeleton); a miss shows the skeleton until the fetch
 * resolves. Fresh values are written back through the cache and failures are
 * DEV-logged at the data-layer boundary.
 */
export function useCachedAsync<T>(
  cache: ResourceCache<T>,
  fetcher: () => Promise<T>,
  fallback: T,
  label: string,
): Async<T> {
  return useCached(useAsync, cache, fetcher, fallback, label);
}

/**
 * As useCachedAsync, but the revalidation network read defers until the observed
 * element first scrolls into view. Cached content still paints on mount so a
 * below-fold section is instant on repeat visits without an early network read.
 */
export function useCachedAsyncOnVisible<T>(
  cache: ResourceCache<T>,
  fetcher: () => Promise<T>,
  fallback: T,
  label: string,
): AsyncOnVisible<T> {
  return useCached(useAsyncOnVisible, cache, fetcher, fallback, label);
}
