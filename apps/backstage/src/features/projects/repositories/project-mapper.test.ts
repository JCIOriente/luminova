import { describe, expect, it } from "vitest";
import { toProjectCreateDoc, toProjectUpdateDoc } from "./project-mapper";

const input = {
  title: "Proyecto Y",
  roster: { directorId: "m1", coDirectorId: "m2", teamIds: [] as string[] },
  status: "EnEjecucion" as const,
};

describe("toProjectCreateDoc", () => {
  it("adds termId + null finalReport", () => {
    expect(toProjectCreateDoc(input, "2026")).toEqual({
      termId: "2026",
      title: "Proyecto Y",
      roster: { directorId: "m1", coDirectorId: "m2", teamIds: [] },
      status: "EnEjecucion",
      finalReport: null,
    });
  });
});

describe("toProjectUpdateDoc", () => {
  it("maps editable fields only", () => {
    expect(toProjectUpdateDoc(input)).toEqual({
      title: "Proyecto Y",
      roster: { directorId: "m1", coDirectorId: "m2", teamIds: [] },
      status: "EnEjecucion",
    });
  });
});
