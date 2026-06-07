import { describe, expect, it } from "vitest";
import { lockedFieldsChanged } from "./activity-guard";

const current = { category: "Assembly" as const, startAt: 1000 };

describe("lockedFieldsChanged", () => {
  it("flags a changed startAt", () => {
    expect(lockedFieldsChanged(current, { category: "Assembly", startAt: 2000 })).toBe(true);
  });
  it("flags a changed category", () => {
    expect(lockedFieldsChanged(current, { category: "Course", startAt: 1000 })).toBe(true);
  });
  it("allows unchanged locked fields", () => {
    expect(lockedFieldsChanged(current, { category: "Assembly", startAt: 1000 })).toBe(false);
  });
});
