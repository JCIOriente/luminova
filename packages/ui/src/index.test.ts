import { expect, test } from "vitest";
import { cn } from "./lib/cn.js";

test("cn merges classes and dedupes conflicts", () => {
  expect(cn("px-2", "px-4")).toBe("px-4");
  expect(cn("a", false, "b")).toBe("a b");
});
