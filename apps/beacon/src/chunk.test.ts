import { describe, expect, it } from "vitest";
import { chunk } from "./chunk.js";

describe("chunk", () => {
  it("returns no batches for an empty array", () => {
    expect(chunk([], 300)).toEqual([]);
  });

  it("returns a single batch when the array fits", () => {
    expect(chunk([1, 2, 3], 300)).toEqual([[1, 2, 3]]);
  });

  it("splits into batches of the given size, last batch shorter", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("splits an exact multiple into equal batches", () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("bounds each getAll-sized batch at 300 for a large input", () => {
    const ids = Array.from({ length: 750 }, (_, i) => i);
    const batches = chunk(ids, 300);
    expect(batches.map((b) => b.length)).toEqual([300, 300, 150]);
  });
});
