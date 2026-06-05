import { expect, test } from "vitest";
import { FUNCTION_NAME } from "./index.js";

test("function name", () => {
  expect(FUNCTION_NAME).toBe("awardPoints");
});
