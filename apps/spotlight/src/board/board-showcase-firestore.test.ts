import { describe, it, expect } from "vitest";
import { sortByRank } from "./board-showcase-firestore";
import type { BoardShowcaseItem } from "@luminova/types/engine";

const m = (id: string, name: string, group: "CEL" | "JDL", rank: number): BoardShowcaseItem => ({
  id,
  name,
  title: id,
  group,
  rank,
  portraitUrl: "https://cdn/" + id,
});

describe("sortByRank", () => {
  it("orders CEL by statutory rank, then JDL after, ties broken by name (es)", () => {
    const sorted = sortByRank([
      m("d2", "Zoe", "JDL", 1000),
      m("c1", "Ana", "CEL", 3),
      m("d1", "Beto", "JDL", 1000),
      m("p", "Pres", "CEL", 0),
    ]);
    expect(sorted.map((x) => x.name)).toEqual(["Pres", "Ana", "Beto", "Zoe"]);
  });
});
