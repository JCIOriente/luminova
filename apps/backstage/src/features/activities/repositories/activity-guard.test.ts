import { describe, expect, it } from "vitest";
import { lockedFieldsChanged } from "./activity-guard";

const current = {
  category: "Assembly" as const,
  startAt: 1000,
  parentType: null,
  parentId: null,
};

describe("lockedFieldsChanged", () => {
  it("flags a changed startAt", () => {
    expect(lockedFieldsChanged(current, { ...current, startAt: 2000 })).toBe(true);
  });
  it("flags a changed category", () => {
    expect(lockedFieldsChanged(current, { ...current, category: "Course" })).toBe(true);
  });
  it("flags a re-parented activity (parentType/parentId)", () => {
    expect(lockedFieldsChanged(current, { ...current, parentType: "Project" })).toBe(true);
    expect(lockedFieldsChanged(current, { ...current, parentId: "p1" })).toBe(true);
  });
  it("allows unchanged locked fields", () => {
    expect(lockedFieldsChanged(current, { ...current })).toBe(false);
  });
});
