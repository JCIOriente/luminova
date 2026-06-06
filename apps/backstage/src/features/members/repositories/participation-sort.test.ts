import { describe, it, expect } from "vitest";
import type { Participation } from "@luminova/types/engine";
import { byMonthThenPoints } from "./participation-sort";

function row(p: Partial<Participation>): Participation {
  return { monthBucket: "2026-06", computedPoints: 1, ...p } as Participation;
}

describe("byMonthThenPoints", () => {
  it("orders newest month first, then highest points", () => {
    const out = [
      row({ monthBucket: "2026-05", computedPoints: 9 }),
      row({ monthBucket: "2026-07", computedPoints: 2 }),
      row({ monthBucket: "2026-07", computedPoints: 8 }),
    ]
      .slice()
      .sort(byMonthThenPoints)
      .map((r) => [r.monthBucket, r.computedPoints]);
    expect(out).toEqual([
      ["2026-07", 8],
      ["2026-07", 2],
      ["2026-05", 9],
    ]);
  });
});
