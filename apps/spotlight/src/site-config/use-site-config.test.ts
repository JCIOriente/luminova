import { afterEach, describe, expect, it, vi } from "vitest";
import { readCache, writeCache, CACHE_KEY } from "./use-site-config";
import { SITE_CONFIG_DEFAULTS } from "./defaults";

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
  it("round-trips a complete config", () => {
    mockStorage();
    writeCache(SITE_CONFIG_DEFAULTS);
    expect(readCache()).toEqual(SITE_CONFIG_DEFAULTS);
  });
  it("backfills fields missing from a legacy cache", () => {
    const store = mockStorage();
    // Pre-hero / pre-socials shape written by an older build.
    store.set(CACHE_KEY, JSON.stringify({ stats: { programCount: 5 } }));
    const cached = readCache();
    expect(cached?.hero).toEqual(SITE_CONFIG_DEFAULTS.hero);
    expect(cached?.contact.socials).toEqual(SITE_CONFIG_DEFAULTS.contact.socials);
    expect(cached?.contact.mapUrl).toEqual(SITE_CONFIG_DEFAULTS.contact.mapUrl);
    expect(cached?.stats.programCount).toBe(5);
  });
  it("returns null on corrupt JSON", () => {
    const store = mockStorage();
    store.set(CACHE_KEY, "{not json");
    expect(readCache()).toBeNull();
  });
});
