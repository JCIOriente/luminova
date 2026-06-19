import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import {
  toInitiativeCreateDoc,
  toInitiativeUpdateDoc,
  initiativeToInput,
} from "./initiative-mapper";
import type { InitiativeInput } from "@luminova/types";

const VALID_INPUT: InitiativeInput = {
  title: "Iniciativa X",
  description: "Una descripción suficientemente larga para pasar validación.",
  category: "DesarrolloComunitario",
  startDate: "2026-02-01",
  endDate: "2026-08-31",
  roster: { directorId: "m1", coDirectorIds: [], teamIds: ["m2"] },
  status: "Planificacion",
  featured: false,
};

describe("toInitiativeCreateDoc", () => {
  it("adds termId, system defaults, and converts dates to Timestamps", () => {
    expect(toInitiativeCreateDoc(VALID_INPUT, "2026")).toEqual({
      termId: "2026",
      title: VALID_INPUT.title,
      description: VALID_INPUT.description,
      category: VALID_INPUT.category,
      startDate: Timestamp.fromDate(new Date("2026-02-01T00:00:00Z")),
      endDate: Timestamp.fromDate(new Date("2026-08-31T00:00:00Z")),
      roster: VALID_INPUT.roster,
      status: VALID_INPUT.status,
      featured: false,
      photos: [],
      impact: null,
      finalReport: null,
      directionUids: [],
    });
  });
});

describe("toInitiativeUpdateDoc", () => {
  it("maps editable fields only", () => {
    expect(toInitiativeUpdateDoc(VALID_INPUT)).toEqual({
      title: VALID_INPUT.title,
      description: VALID_INPUT.description,
      category: VALID_INPUT.category,
      startDate: Timestamp.fromDate(new Date("2026-02-01T00:00:00Z")),
      endDate: Timestamp.fromDate(new Date("2026-08-31T00:00:00Z")),
      roster: VALID_INPUT.roster,
      status: VALID_INPUT.status,
      featured: false,
    });
  });

  it("carries the featured flag through create and update", () => {
    const featured = { ...VALID_INPUT, featured: true };
    expect(toInitiativeCreateDoc(featured, "2026").featured).toBe(true);
    expect(toInitiativeUpdateDoc(featured).featured).toBe(true);
  });

  it("update doc never touches photos/impact/finalReport/directionUids", () => {
    const docData = toInitiativeUpdateDoc(VALID_INPUT);
    expect(Object.keys(docData).sort()).toEqual([
      "category",
      "description",
      "endDate",
      "featured",
      "roster",
      "startDate",
      "status",
      "title",
    ]);
  });
});

describe("initiativeToInput", () => {
  it("converts Timestamps back to YYYY-MM-DD strings", () => {
    const core = {
      id: "i1",
      termId: "2026",
      title: VALID_INPUT.title,
      description: VALID_INPUT.description,
      category: VALID_INPUT.category,
      startDate: Timestamp.fromDate(new Date("2026-02-01T00:00:00Z")),
      endDate: Timestamp.fromDate(new Date("2026-08-31T00:00:00Z")),
      roster: { ...VALID_INPUT.roster },
      status: VALID_INPUT.status,
      photos: [] as never[],
      impact: null,
      finalReport: null,
      directionUids: [] as string[],
      featured: true,
    };

    expect(initiativeToInput(core)).toEqual({
      title: VALID_INPUT.title,
      description: VALID_INPUT.description,
      category: VALID_INPUT.category,
      startDate: "2026-02-01",
      endDate: "2026-08-31",
      roster: VALID_INPUT.roster,
      status: VALID_INPUT.status,
      featured: true,
    });
  });

  it("defaults featured to false for a pre-feature doc that lacks the field", () => {
    const core = {
      id: "i1",
      termId: "2026",
      title: VALID_INPUT.title,
      description: VALID_INPUT.description,
      category: VALID_INPUT.category,
      startDate: Timestamp.fromDate(new Date("2026-02-01T00:00:00Z")),
      endDate: Timestamp.fromDate(new Date("2026-08-31T00:00:00Z")),
      roster: { ...VALID_INPUT.roster },
      status: VALID_INPUT.status,
      photos: [] as never[],
      impact: null,
      finalReport: null,
      directionUids: [] as string[],
      featured: undefined as unknown as boolean,
    };
    expect(initiativeToInput(core).featured).toBe(false);
  });
});
