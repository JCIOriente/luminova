import { expect, test } from "vitest";
import { scaleY, seriesPath, areaPath } from "./line-chart.js";

test("scaleY flips a value within [min,max] to pixel space", () => {
  expect(scaleY(10, 0, 10, 100)).toBe(0);
  expect(scaleY(0, 0, 10, 100)).toBe(100);
  expect(scaleY(5, 0, 10, 100)).toBe(50);
});

test("scaleY centers a degenerate range", () => {
  expect(scaleY(5, 5, 5, 80)).toBe(40);
});

test("seriesPath spaces points evenly across the width", () => {
  const d = seriesPath([0, 10], 100, 100, 0, 10);
  expect(d).toBe("M0.00 100.00 L100.00 0.00");
});

test("areaPath closes the line down to the baseline", () => {
  const d = areaPath([0, 10], 100, 100, 0, 10);
  expect(d.startsWith("M0.00 100.00 L100.00 0.00")).toBe(true);
  expect(d.endsWith("L100.00 100.00 L0.00 100.00 Z")).toBe(true);
});
