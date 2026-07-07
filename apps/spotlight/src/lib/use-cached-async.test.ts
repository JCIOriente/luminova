import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useCachedAsync, useCachedAsyncOnVisible } from "./use-cached-async";
import { makeResourceCache } from "./cached-resource";
import { mockStorage } from "../test/mock-storage";

type Cb = (entries: IntersectionObserverEntry[]) => void;
let lastCallback: Cb | null = null;
let observedNodes: Element[] = [];

class ControllableObserver {
  constructor(cb: Cb) {
    lastCallback = cb;
  }
  observe(node: Element) {
    observedNodes.push(node);
  }
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

function intersect() {
  act(() => {
    lastCallback?.([{ isIntersecting: true } as IntersectionObserverEntry]);
  });
}

beforeEach(() => {
  lastCallback = null;
  observedNodes = [];
  globalThis.IntersectionObserver = ControllableObserver as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useCachedAsync", () => {
  it("shows the skeleton (loading:true) on a cache miss until the fetch resolves", async () => {
    mockStorage();
    const cache = makeResourceCache<number[]>({ key: "k" });
    const fetcher = vi.fn(() => Promise.resolve([9]));
    const { result } = renderHook(() => useCachedAsync(cache, fetcher, [], "k"));

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toEqual([]);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([9]);
    expect(cache.read()).toEqual([9]);
  });

  it("paints cached content instantly (loading:false) on a cache hit", async () => {
    const store = mockStorage();
    store.set("k", JSON.stringify([1, 2]));
    const cache = makeResourceCache<number[]>({ key: "k" });
    const fetcher = vi.fn(() => Promise.resolve([3, 4]));
    const { result } = renderHook(() => useCachedAsync(cache, fetcher, [], "k"));

    // no skeleton flash — cached data is shown at once
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual([1, 2]);

    // revalidation still runs and replaces the data
    await waitFor(() => expect(result.current.data).toEqual([3, 4]));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("useCachedAsyncOnVisible", () => {
  it("paints cached content on mount but defers the network read until visible", async () => {
    const store = mockStorage();
    store.set("k", JSON.stringify([1]));
    const cache = makeResourceCache<number[]>({ key: "k" });
    const fetcher = vi.fn(() => Promise.resolve([2]));
    const { result } = renderHook(() => useCachedAsyncOnVisible(cache, fetcher, [], "k"));

    act(() => result.current.ref(document.createElement("div")));

    // cached content is up immediately, no fetch yet
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual([1]);
    expect(fetcher).not.toHaveBeenCalled();

    intersect();
    await waitFor(() => expect(result.current.data).toEqual([2]));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("stays loading with no fetch until visible on a cache miss", () => {
    mockStorage();
    const cache = makeResourceCache<number[]>({ key: "k" });
    const fetcher = vi.fn(() => Promise.resolve([2]));
    const { result } = renderHook(() => useCachedAsyncOnVisible(cache, fetcher, [], "k"));

    act(() => result.current.ref(document.createElement("div")));
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
