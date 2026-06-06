import { describe, it, expect } from "vitest";
import { activitySchema } from "./activity-schema";

const base = {
  category: "ProjectExecution" as const,
  parentType: "Project" as const,
  parentId: "p-1",
  startAt: "2026-06-06T18:00",
  directorId: "m-1",
  coDirectorId: null,
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
        coDirectorId: null,
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
        coDirectorId: null,
      }).success,
    ).toBe(false);
  });
});

describe("activitySchema coDirectorId", () => {
  const inst = {
    category: "Assembly" as const,
    parentType: null,
    parentId: null,
    startAt: "2026-06-06T18:00",
    directorId: null,
  };
  it("keeps a null coDirectorId", () => {
    const r = activitySchema.parse({ ...inst, coDirectorId: null });
    expect(r.coDirectorId).toBeNull();
  });
  it("keeps a member coDirectorId", () => {
    const r = activitySchema.parse({ ...inst, coDirectorId: "m2" });
    expect(r.coDirectorId).toBe("m2");
  });
});
