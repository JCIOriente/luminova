export interface ResourceCache<T> {
  read(): T | null;
  write(value: T): void;
}

/**
 * A localStorage-backed cache for a single public read. `serialize`/`revive`
 * bridge non-JSON-safe values (e.g. Firestore Timestamps stored as millis).
 * Every access is try/catch-guarded — a missing/corrupt entry reads as null and
 * a failed write (quota, private mode) is swallowed so the caller falls back to
 * the network.
 */
export function makeResourceCache<T>(opts: {
  key: string;
  serialize?: (value: T) => unknown;
  revive?: (raw: unknown) => T;
}): ResourceCache<T> {
  const { key, serialize, revive } = opts;
  return {
    read() {
      try {
        const raw = localStorage.getItem(key);
        if (raw === null) return null;
        const parsed: unknown = JSON.parse(raw);
        return revive ? revive(parsed) : (parsed as T);
      } catch {
        return null;
      }
    },
    write(value) {
      try {
        localStorage.setItem(key, JSON.stringify(serialize ? serialize(value) : value));
      } catch {
        /* quota / private mode — ignore, fall back to the network next load */
      }
    },
  };
}

/**
 * Collapses concurrent calls into a single inflight promise, released once it
 * settles so the next call re-fetches. Mirrors the once-per-load revalidation
 * the site-config hook has always used.
 */
export function dedupe<T>(fn: () => Promise<T>): () => Promise<T> {
  let inflight: Promise<T> | null = null;
  return () => {
    inflight ??= fn().finally(() => {
      inflight = null;
    });
    return inflight;
  };
}

/**
 * Wraps a fetcher so a successful result is written through to the cache and a
 * failure is logged (DEV only, never in the shipped bundle) then rethrown for
 * the async hook to surface as an error state.
 */
export function withCache<T>(
  cache: ResourceCache<T>,
  fetcher: () => Promise<T>,
  label: string,
): () => Promise<T> {
  return () =>
    fetcher()
      .then((value) => {
        cache.write(value);
        return value;
      })
      .catch((err: unknown) => {
        if (import.meta.env.DEV) {
          console.error(`[spotlight] ${label} read failed`, err);
        }
        throw err;
      });
}
