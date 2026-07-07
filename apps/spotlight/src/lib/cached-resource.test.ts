import { afterEach, describe, expect, it, vi } from "vitest";
import { makeResourceCache, dedupe, withCache } from "./cached-resource";

function mockStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  });
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("makeResourceCache", () => {
  it("returns null when the key is empty", () => {
    mockStorage();
    const cache = makeResourceCache<number[]>({ key: "k" });
    expect(cache.read()).toBeNull();
  });

  it("round-trips a value without transforms", () => {
    mockStorage();
    const cache = makeResourceCache<{ a: number }>({ key: "k" });
    cache.write({ a: 1 });
    expect(cache.read()).toEqual({ a: 1 });
  });

  it("applies serialize on write and revive on read", () => {
    const store = mockStorage();
    const cache = makeResourceCache<{ when: Date }>({
      key: "k",
      serialize: (v) => ({ when: v.when.getTime() }),
      revive: (raw) => ({ when: new Date((raw as { when: number }).when) }),
    });
    cache.write({ when: new Date(1000) });
    expect(store.get("k")).toBe(JSON.stringify({ when: 1000 }));
    const out = cache.read();
    expect(out?.when).toBeInstanceOf(Date);
    expect(out?.when.getTime()).toBe(1000);
  });

  it("returns null on corrupt JSON", () => {
    const store = mockStorage();
    store.set("k", "{not json");
    expect(makeResourceCache<number>({ key: "k" }).read()).toBeNull();
  });

  it("swallows write failures (quota / private mode)", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
      removeItem: () => {},
    });
    const cache = makeResourceCache<number>({ key: "k" });
    expect(() => cache.write(1)).not.toThrow();
  });
});

describe("dedupe", () => {
  it("shares one inflight promise across concurrent calls", async () => {
    let calls = 0;
    const deduped = dedupe(async () => {
      calls += 1;
      return calls;
    });
    const [a, b] = await Promise.all([deduped(), deduped()]);
    expect(calls).toBe(1);
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  it("re-invokes after the inflight promise settles", async () => {
    let calls = 0;
    const deduped = dedupe(async () => {
      calls += 1;
      return calls;
    });
    await deduped();
    await deduped();
    expect(calls).toBe(2);
  });

  it("clears the inflight promise even when the function rejects", async () => {
    let calls = 0;
    const deduped = dedupe(async () => {
      calls += 1;
      throw new Error("boom");
    });
    await expect(deduped()).rejects.toThrow("boom");
    await expect(deduped()).rejects.toThrow("boom");
    expect(calls).toBe(2);
  });
});

describe("withCache", () => {
  it("writes the fetched value to the cache and returns it", async () => {
    mockStorage();
    const cache = makeResourceCache<number[]>({ key: "k" });
    const wrapped = withCache(cache, async () => [1, 2], "nums");
    expect(await wrapped()).toEqual([1, 2]);
    expect(cache.read()).toEqual([1, 2]);
  });

  it("logs and rethrows on error in DEV, without writing the cache", async () => {
    vi.stubEnv("DEV", true);
    const store = mockStorage();
    const err = new Error("network");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const cache = makeResourceCache<number[]>({ key: "k" });
    const wrapped = withCache(cache, () => Promise.reject(err), "nums");
    await expect(wrapped()).rejects.toThrow("network");
    expect(spy).toHaveBeenCalledOnce();
    expect(store.has("k")).toBe(false);
  });

  it("does not log in production builds", async () => {
    vi.stubEnv("DEV", false);
    mockStorage();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const wrapped = withCache(
      makeResourceCache<number[]>({ key: "k" }),
      () => Promise.reject(new Error("network")),
      "nums",
    );
    await expect(wrapped()).rejects.toThrow("network");
    expect(spy).not.toHaveBeenCalled();
  });
});
