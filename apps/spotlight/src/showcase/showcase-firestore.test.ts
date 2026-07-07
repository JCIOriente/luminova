import { afterEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase/firestore/lite";
import { sortByCompletedDesc, showcaseListCache, featuredCache } from "./showcase-firestore";
import { mockStorage } from "../test/mock-storage";
import type { ShowcaseItem } from "@luminova/types/engine";

const item = (id: string, ms: number, featured = false) =>
  ({
    id,
    featured,
    startDate: Timestamp.fromMillis(ms - 1000),
    endDate: Timestamp.fromMillis(ms - 500),
    completedAt: Timestamp.fromMillis(ms),
  }) as unknown as ShowcaseItem;

afterEach(() => vi.unstubAllGlobals());

describe("sortByCompletedDesc", () => {
  it("orders newest completedAt first", () => {
    const out = sortByCompletedDesc([item("a", 100), item("c", 300), item("b", 200)]);
    expect(out.map((i) => i.id)).toEqual(["c", "b", "a"]);
  });
});

describe.each([
  ["showcaseListCache", showcaseListCache],
  ["featuredCache", featuredCache],
])("%s Timestamp round-trip", (_name, cache) => {
  it("preserves Timestamp fields through JSON (millis serialize / revive)", () => {
    mockStorage();
    cache.write([item("a", 1_700_000_000_000)]);
    const first = cache.read()?.[0];
    expect(first?.completedAt).toBeInstanceOf(Timestamp);
    expect(first?.completedAt.toMillis()).toBe(1_700_000_000_000);
    expect(first?.startDate.toMillis()).toBe(1_699_999_999_000);
    expect(first?.endDate.toMillis()).toBe(1_699_999_999_500);
  });
});
