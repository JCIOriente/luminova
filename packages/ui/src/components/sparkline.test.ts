import { expect, test } from "vitest";
import { sparklinePoints } from "./sparkline.js";

test("maps values into the box, flipping Y so larger values sit higher", () => {
  const pts = sparklinePoints([0, 10], 100, 40, 0);
  expect(pts).toEqual([
    { x: 0, y: 40 },
    { x: 100, y: 0 },
  ]);
});

test("a flat series renders along the vertical midline", () => {
  const pts = sparklinePoints([5, 5, 5], 80, 20, 0);
  expect(pts.map((p) => p.y)).toEqual([10, 10, 10]);
  expect(pts.map((p) => p.x)).toEqual([0, 40, 80]);
});

test("padding insets the drawable area", () => {
  const pts = sparklinePoints([0, 10], 100, 40, 4);
  expect(pts[0]).toEqual({ x: 4, y: 36 });
  expect(pts[1]).toEqual({ x: 96, y: 4 });
});
