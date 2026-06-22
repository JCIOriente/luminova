import { describe, it, expect } from "vitest";
import { sortByName } from "./ally-showcase-firestore";
import type { AllyShowcaseItem } from "@luminova/types/engine";

const a = (id: string, name: string): AllyShowcaseItem => ({
  id,
  name,
  logoUrl: "https://cdn/" + id,
  category: "University",
});

describe("sortByName", () => {
  it("sorts allies alphabetically (es)", () => {
    expect(sortByName([a("2", "Zeta"), a("1", "Alfa")]).map((x) => x.name)).toEqual([
      "Alfa",
      "Zeta",
    ]);
  });
});
