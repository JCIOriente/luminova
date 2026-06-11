import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import { toProjectCreateDoc, toProjectUpdateDoc } from "./project-mapper";
import type { ProjectInput } from "@luminova/types";

const VALID_INPUT: ProjectInput = {
  title: "Proyecto Y",
  description: "Una descripción suficientemente larga para pasar validación.",
  category: "DesarrolloComunitario",
  startDate: "2026-02-01",
  endDate: "2026-08-31",
  roster: { directorId: "m1", coDirectorIds: [], teamIds: [] },
  status: "EnEjecucion",
};

describe("toProjectCreateDoc", () => {
  it("adds termId, system defaults, and converts dates to Timestamps", () => {
    expect(toProjectCreateDoc(VALID_INPUT, "2026")).toEqual({
      termId: "2026",
      title: VALID_INPUT.title,
      description: VALID_INPUT.description,
      category: VALID_INPUT.category,
      startDate: Timestamp.fromDate(new Date("2026-02-01T00:00:00Z")),
      endDate: Timestamp.fromDate(new Date("2026-08-31T00:00:00Z")),
      roster: VALID_INPUT.roster,
      status: VALID_INPUT.status,
      photos: [],
      impact: null,
      finalReport: null,
      directionUids: [],
    });
  });
});

describe("toProjectUpdateDoc", () => {
  it("maps editable fields only", () => {
    expect(toProjectUpdateDoc(VALID_INPUT)).toEqual({
      title: VALID_INPUT.title,
      description: VALID_INPUT.description,
      category: VALID_INPUT.category,
      startDate: Timestamp.fromDate(new Date("2026-02-01T00:00:00Z")),
      endDate: Timestamp.fromDate(new Date("2026-08-31T00:00:00Z")),
      roster: VALID_INPUT.roster,
      status: VALID_INPUT.status,
    });
  });

  it("update doc never touches photos/impact/finalReport/directionUids", () => {
    const docData = toProjectUpdateDoc(VALID_INPUT);
    expect(Object.keys(docData).sort()).toEqual([
      "category",
      "description",
      "endDate",
      "roster",
      "startDate",
      "status",
      "title",
    ]);
  });
});
