import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import { sortByCompletedDesc } from "./showcase-firestore";
import type { ShowcaseItem } from "@luminova/types/engine";

const item = (id: string, ms: number) =>
  ({ id, completedAt: Timestamp.fromMillis(ms) } as unknown as ShowcaseItem);

describe("sortByCompletedDesc", () => {
  it("orders newest completedAt first", () => {
    const out = sortByCompletedDesc([item("a", 100), item("c", 300), item("b", 200)]);
    expect(out.map((i) => i.id)).toEqual(["c", "b", "a"]);
  });
});
