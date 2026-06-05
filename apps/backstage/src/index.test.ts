import { expect, test } from "vitest";
import { APP_NAME } from "./index.js";

test("app name", () => {
  expect(APP_NAME).toBe("backstage");
});
