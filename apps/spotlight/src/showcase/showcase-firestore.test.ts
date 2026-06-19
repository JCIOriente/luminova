import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import { selectFeatured, sortByCompletedDesc } from "./showcase-firestore";
import type { ShowcaseItem } from "@luminova/types/engine";

const item = (id: string, ms: number, featured = false) =>
  ({ id, completedAt: Timestamp.fromMillis(ms), featured }) as unknown as ShowcaseItem;

describe("sortByCompletedDesc", () => {
  it("orders newest completedAt first", () => {
    const out = sortByCompletedDesc([item("a", 100), item("c", 300), item("b", 200)]);
    expect(out.map((i) => i.id)).toEqual(["c", "b", "a"]);
  });
});

describe("selectFeatured", () => {
  it("keeps only featured items, newest completedAt first", () => {
    const out = selectFeatured([
      item("a", 100, true),
      item("plain", 400, false),
      item("c", 300, true),
      item("b", 200, true),
    ]);
    expect(out.map((i) => i.id)).toEqual(["c", "b", "a"]);
  });

  it("returns [] when nothing is featured", () => {
    expect(selectFeatured([item("a", 100, false), item("b", 200, false)])).toEqual([]);
  });
});
