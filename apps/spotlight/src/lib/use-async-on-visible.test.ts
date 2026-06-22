import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useAsyncOnVisible } from "./use-async-on-visible";

type Cb = (entries: IntersectionObserverEntry[]) => void;

let lastCallback: Cb | null = null;
let disconnectCount = 0;
let observedNodes: Element[] = [];

class ControllableObserver {
  constructor(cb: Cb) {
    lastCallback = cb;
  }
  observe(node: Element) {
    observedNodes.push(node);
  }
  unobserve() {}
  disconnect() {
    disconnectCount += 1;
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

function intersect(isIntersecting: boolean) {
  act(() => {
    lastCallback?.([{ isIntersecting } as IntersectionObserverEntry]);
  });
}

describe("useAsyncOnVisible", () => {
  beforeEach(() => {
    lastCallback = null;
    disconnectCount = 0;
    observedNodes = [];
    globalThis.IntersectionObserver =
      ControllableObserver as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not fetch before intersection and stays loading with empty data", () => {
    const fetcher = vi.fn(() => Promise.resolve("done"));
    const { result } = renderHook(() => useAsyncOnVisible(fetcher, "empty", []));

    // attach the ref so the observer starts observing
    const node = document.createElement("div");
    act(() => {
      result.current.ref(node);
    });

    expect(observedNodes).toContain(node);
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.data).toBe("empty");
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBe(false);
  });

  it("fetches exactly once on intersection and resolves to loaded state", async () => {
    const fetcher = vi.fn(() => Promise.resolve("done"));
    const { result } = renderHook(() => useAsyncOnVisible(fetcher, "empty", []));

    act(() => {
      result.current.ref(document.createElement("div"));
    });

    intersect(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.current.data).toBe("done");
    expect(result.current.error).toBe(false);
  });

  it("does not fetch again on re-intersect", async () => {
    const fetcher = vi.fn(() => Promise.resolve("done"));
    const { result } = renderHook(() => useAsyncOnVisible(fetcher, "empty", []));

    act(() => {
      result.current.ref(document.createElement("div"));
    });

    intersect(true);
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    intersect(false);
    intersect(true);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(disconnectCount).toBeGreaterThanOrEqual(1);
  });
});
