import { vi } from "vitest";

// Stubs a minimal localStorage backed by an in-memory Map. Returns the backing
// store so tests can seed/inspect it. Pair with `vi.unstubAllGlobals()`.
export function mockStorage(): Map<string, string> {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  });
  return store;
}
