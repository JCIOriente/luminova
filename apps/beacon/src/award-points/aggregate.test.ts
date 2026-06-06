import { describe, it, expect } from "vitest";
import { aggregateFromRows } from "./aggregate.js";

describe("aggregateFromRows", () => {
  it("sums confirmed computedPoints into cumulative + byMonth", () => {
    const agg = aggregateFromRows([
      { computedPoints: 3, monthBucket: "2026-06", state: "confirmed" },
      { computedPoints: 5, monthBucket: "2026-06", state: "confirmed" },
      { computedPoints: 4, monthBucket: "2026-07", state: "confirmed" },
    ]);
    expect(agg).toEqual({ cumulative: 12, byMonth: { "2026-06": 8, "2026-07": 4 } });
  });

  it("ignores provisional and voided rows", () => {
    const agg = aggregateFromRows([
      { computedPoints: 3, monthBucket: "2026-06", state: "confirmed" },
      { computedPoints: 9, monthBucket: "2026-06", state: "provisional" },
      { computedPoints: 9, monthBucket: "2026-06", state: "voided" },
    ]);
    expect(agg).toEqual({ cumulative: 3, byMonth: { "2026-06": 3 } });
  });

  it("is empty for no rows", () => {
    expect(aggregateFromRows([])).toEqual({ cumulative: 0, byMonth: {} });
  });
});
