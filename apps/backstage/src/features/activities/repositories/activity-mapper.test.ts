import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase/firestore";
import { toActivityCreateDoc, toActivityUpdateDoc } from "./activity-mapper";
import type { ActivityInput } from "@luminova/types";

const BASIC_INPUT: ActivityInput = {
  title: "Asamblea General",
  description: "",
  location: "",
  category: "Assembly",
  parentType: null,
  parentId: null,
  startAt: "2026-06-10T18:30",
  endAt: null,
  directorId: null,
  coDirectorIds: [],
};

describe("toActivityCreateDoc", () => {
  it("sets term, status, organizers and a Timestamp startAt", () => {
    const doc = toActivityCreateDoc(BASIC_INPUT, "2026");
    expect(doc.termId).toBe("2026");
    expect(doc.status).toBe("Programada");
    expect(doc.organizers).toEqual({ directorId: null, coDirectorIds: [] });
    expect(doc.startAt).toBeInstanceOf(Timestamp);
    expect(doc.parentType).toBeNull();
    expect(doc.parentId).toBeNull();
  });

  it("round-trips startAt as the exact local datetime (UTC-stable)", () => {
    const doc = toActivityCreateDoc(BASIC_INPUT, "2026");
    expect(doc.startAt.toDate().toISOString()).toBe("2026-06-10T18:30:00.000Z");
  });

  it("converts empty description to null", () => {
    const doc = toActivityCreateDoc(BASIC_INPUT, "2026");
    expect(doc.description).toBeNull();
  });

  it("preserves non-empty description", () => {
    const doc = toActivityCreateDoc({ ...BASIC_INPUT, description: "Texto" }, "2026");
    expect(doc.description).toBe("Texto");
  });

  it("converts empty location to null and preserves a non-empty one", () => {
    expect(toActivityCreateDoc(BASIC_INPUT, "2026").location).toBeNull();
    expect(
      toActivityCreateDoc({ ...BASIC_INPUT, location: "Sede JCI · Equipetrol" }, "2026").location,
    ).toBe("Sede JCI · Equipetrol");
  });

  it("carries title, director, coDirectorIds, and parent through for a ProjectExecution", () => {
    const doc = toActivityCreateDoc(
      {
        title: "Ejecución de Proyecto",
        description: "",
        location: "",
        category: "ProjectExecution",
        parentType: "Project",
        parentId: "p-1",
        startAt: "2026-06-10T18:30",
        endAt: null,
        directorId: "m-1",
        coDirectorIds: ["m-2"],
      },
      "2026",
    );
    expect(doc.title).toBe("Ejecución de Proyecto");
    expect(doc.organizers).toEqual({ directorId: "m-1", coDirectorIds: ["m-2"] });
    expect(doc.parentType).toBe("Project");
    expect(doc.parentId).toBe("p-1");
  });

  it("sets endAt to null when not provided", () => {
    const doc = toActivityCreateDoc(BASIC_INPUT, "2026");
    expect(doc.endAt).toBeNull();
  });

  it("converts endAt string to Timestamp when provided", () => {
    const doc = toActivityCreateDoc({ ...BASIC_INPUT, endAt: "2026-06-10T20:00" }, "2026");
    expect(doc.endAt).toBeInstanceOf(Timestamp);
    expect((doc.endAt as Timestamp).toDate().toISOString()).toBe("2026-06-10T20:00:00.000Z");
  });

  it("initialises photos as empty array", () => {
    const doc = toActivityCreateDoc(BASIC_INPUT, "2026");
    expect(doc.photos).toEqual([]);
  });
});

describe("toActivityUpdateDoc", () => {
  it("maps editable fields, excludes termId/status/photos", () => {
    const doc = toActivityUpdateDoc({
      title: "Asamblea Actualizada",
      description: "Nota.",
      location: "Hotel Los Tajibos",
      category: "ProjectExecution",
      parentType: "Project",
      parentId: "p1",
      startAt: "2026-06-06T18:00",
      endAt: null,
      directorId: "m1",
      coDirectorIds: ["m2"],
    });
    expect(doc).toMatchObject({
      title: "Asamblea Actualizada",
      description: "Nota.",
      category: "ProjectExecution",
      parentType: "Project",
      parentId: "p1",
      organizers: { directorId: "m1", coDirectorIds: ["m2"] },
    });
    expect("termId" in doc).toBe(false);
    expect("status" in doc).toBe(false);
    expect("photos" in doc).toBe(false);
    expect(doc.startAt.toDate().toISOString()).toBe("2026-06-06T18:00:00.000Z");
  });

  it("update doc never touches photos/termId/status", () => {
    const docData = toActivityUpdateDoc(BASIC_INPUT);
    expect(Object.keys(docData).sort()).toEqual([
      "category",
      "description",
      "endAt",
      "location",
      "organizers",
      "parentId",
      "parentType",
      "startAt",
      "title",
    ]);
  });
});
