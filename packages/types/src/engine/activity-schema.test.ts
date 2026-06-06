import { describe, it, expect } from "vitest";
import { activitySchema } from "./activity-schema";

const base = {
  category: "ProjectExecution" as const,
  parentType: "Project" as const,
  parentId: "p-1",
  startAt: "2026-06-06T18:00",
  directorId: "m-1",
};

describe("activitySchema", () => {
  it("accepts a ProjectExecution with a parent", () => {
    expect(activitySchema.safeParse(base).success).toBe(true);
  });

  it("accepts an institutional activity with no parent", () => {
    expect(
      activitySchema.safeParse({
        category: "Assembly",
        parentType: null,
        parentId: null,
        startAt: "2026-06-06T18:00",
        directorId: null,
      }).success,
    ).toBe(true);
  });

  it("rejects a ProjectExecution without a parent (Invariant A)", () => {
    expect(activitySchema.safeParse({ ...base, parentType: null, parentId: null }).success).toBe(
      false,
    );
  });

  it("rejects an institutional category that carries a parent (Invariant A)", () => {
    expect(
      activitySchema.safeParse({
        category: "Assembly",
        parentType: "Program",
        parentId: "x",
        startAt: "2026-06-06T18:00",
        directorId: null,
      }).success,
    ).toBe(false);
  });
});
