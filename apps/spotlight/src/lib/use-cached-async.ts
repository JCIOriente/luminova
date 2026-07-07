import { useMemo, useRef } from "react";
import { useAsync, type Async } from "./use-async";
import { useAsyncOnVisible, type AsyncOnVisible } from "./use-async-on-visible";
import { withCache, type ResourceCache } from "./cached-resource";

// Read the cache exactly once per mount. A miss is a real null (lists never
// cache as null), so `cached === null` cleanly distinguishes hit from miss.
function useCachedSeed<T>(cache: ResourceCache<T>): T | null {
  const box = useRef<{ value: T | null } | null>(null);
  if (box.current === null) box.current = { value: cache.read() };
  return box.current.value;
}

/**
 * SWR over a public firestore-lite read: seed from the localStorage cache, then
 * revalidate once. A cache hit paints instantly (loading:false, no skeleton); a
 * miss shows the skeleton until the fetch resolves. The wrapped fetcher writes
 * fresh values back through the cache and DEV-logs failures.
 */
export function useCachedAsync<T>(
  cache: ResourceCache<T>,
  fetcher: () => Promise<T>,
  fallback: T,
  label: string,
): Async<T> {
  const cached = useCachedSeed(cache);
  const wrapped = useMemo(() => withCache(cache, fetcher, label), [cache, fetcher, label]);
  const state = useAsync(wrapped, cached ?? fallback, []);
  return { ...state, loading: state.loading && cached === null };
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
  const cached = useCachedSeed(cache);
  const wrapped = useMemo(() => withCache(cache, fetcher, label), [cache, fetcher, label]);
  const state = useAsyncOnVisible(wrapped, cached ?? fallback, []);
  return { ...state, loading: state.loading && cached === null };
}
