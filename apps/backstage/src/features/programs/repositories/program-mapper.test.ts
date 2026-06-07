import { describe, expect, it } from "vitest";
import { toProgramCreateDoc, toProgramUpdateDoc } from "./program-mapper";

const input = {
  title: "Programa X",
  roster: { directorId: "m1", coDirectorId: null, teamIds: ["m2"] },
  status: "Planificacion" as const,
};

describe("toProgramCreateDoc", () => {
  it("adds termId, null finalReport, and passes roster through", () => {
    expect(toProgramCreateDoc(input, "2026")).toEqual({
      termId: "2026",
      title: "Programa X",
      roster: { directorId: "m1", coDirectorId: null, teamIds: ["m2"] },
      status: "Planificacion",
      finalReport: null,
    });
  });
});

describe("toProgramUpdateDoc", () => {
  it("maps editable fields only (no termId / finalReport churn)", () => {
    expect(toProgramUpdateDoc(input)).toEqual({
      title: "Programa X",
      roster: { directorId: "m1", coDirectorId: null, teamIds: ["m2"] },
      status: "Planificacion",
    });
  });
});
