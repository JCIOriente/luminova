import { describe, it, expect } from "vitest";
import { activitySchema } from "./activity-schema";

const VALID = {
  title: "Jornada en La Cuchilla",
  description: "",
  category: "ProjectExecution" as const,
  parentType: "Project" as const,
  parentId: "p-1",
  startAt: "2026-06-06T18:00",
  endAt: null,
  directorId: "m-1",
  coDirectorIds: [],
};

describe("activitySchema", () => {
  it("accepts a ProjectExecution with a parent", () => {
    expect(activitySchema.safeParse(VALID).success).toBe(true);
  });

  it("accepts an institutional activity with no parent", () => {
    expect(
      activitySchema.safeParse({
        title: "Jornada en La Cuchilla",
        description: "",
        category: "Assembly",
        parentType: null,
        parentId: null,
        startAt: "2026-06-06T18:00",
        endAt: null,
        directorId: null,
        coDirectorIds: [],
      }).success,
    ).toBe(true);
  });

  it("rejects a ProjectExecution without a parent (Invariant A)", () => {
    expect(
      activitySchema.safeParse({ ...VALID, parentType: null, parentId: null }).success,
    ).toBe(false);
  });

  it("rejects an institutional category that carries a parent (Invariant A)", () => {
    expect(
      activitySchema.safeParse({
        title: "Jornada en La Cuchilla",
        description: "",
        category: "Assembly",
        parentType: "Program",
        parentId: "x",
        startAt: "2026-06-06T18:00",
        endAt: null,
        directorId: null,
        coDirectorIds: [],
      }).success,
    ).toBe(false);
  });

  it("rejects a missing title", () => {
    expect(activitySchema.safeParse({ ...VALID, title: "" }).success).toBe(false);
  });

  it("rejects endAt before startAt", () => {
    expect(
      activitySchema.safeParse({
        ...VALID,
        startAt: "2026-06-20T18:00",
        endAt: "2026-06-20T17:00",
      }).success,
    ).toBe(false);
  });

  it("accepts endAt null", () => {
    expect(activitySchema.safeParse({ ...VALID, endAt: null }).success).toBe(true);
  });

  it("rejects the director among co-directors", () => {
    expect(
      activitySchema.safeParse({ ...VALID, directorId: "m1", coDirectorIds: ["m1"] }).success,
    ).toBe(false);
  });
});

describe("activitySchema coDirectorIds", () => {
  const inst = {
    title: "Jornada en La Cuchilla",
    description: "",
    category: "Assembly" as const,
    parentType: null,
    parentId: null,
    startAt: "2026-06-06T18:00",
    endAt: null,
    directorId: null,
  };
  it("keeps an empty coDirectorIds array", () => {
    const r = activitySchema.parse({ ...inst, coDirectorIds: [] });
    expect(r.coDirectorIds).toEqual([]);
  });
  it("keeps a member in coDirectorIds", () => {
    const r = activitySchema.parse({ ...inst, coDirectorIds: ["m2"] });
    expect(r.coDirectorIds).toEqual(["m2"]);
  });
});
