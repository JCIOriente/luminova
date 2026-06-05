import { expect, test } from "vitest";
import { UI_PACKAGE } from "./index.js";

test("package name", () => {
  expect(UI_PACKAGE).toBe("@luminova/ui");
});
