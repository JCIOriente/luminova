import { describe, expect, it } from "vitest";
import { CEL_POSITIONS } from "./cel-positions";
import { CEL_POSITION_TITLES } from "./cel-position-titles";

describe("CEL_POSITION_TITLES", () => {
  // The public titles list is a standalone literal (so the RBAC `grants` data in
  // CEL_POSITIONS never reaches the public bundle). This guards it against drift.
  it("matches the CEL catalog titles in order", () => {
    expect(CEL_POSITION_TITLES).toEqual(CEL_POSITIONS.map((p) => p.title));
  });
});
