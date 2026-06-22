import { afterEach, describe, expect, it, vi } from "vitest";
import { readCache, writeCache, CACHE_KEY } from "./use-site-config";

function mockStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  });
  return store;
}

afterEach(() => vi.unstubAllGlobals());

describe("site-config cache", () => {
  it("returns null when empty", () => {
    mockStorage();
    expect(readCache()).toBeNull();
  });
  it("round-trips written config", () => {
    mockStorage();
    const cfg = { stats: { programCount: 5 } } as never;
    writeCache(cfg);
    expect(readCache()).toEqual(cfg);
  });
  it("returns null on corrupt JSON", () => {
    const store = mockStorage();
    store.set(CACHE_KEY, "{not json");
    expect(readCache()).toBeNull();
  });
});
