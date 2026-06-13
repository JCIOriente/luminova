import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import {
  activityParentRefs,
  activityShowcasePhotos,
  projectInitiative,
  rosterMemberIds,
} from "./project-initiative.js";

const ts = (ms: number) => Timestamp.fromMillis(ms);

function completedDoc(over: Record<string, unknown> = {}) {
  return {
    termId: "2026",
    title: "Eco",
    description: "desc",
    category: "DesarrolloComunitario",
    startDate: ts(1000),
    endDate: ts(2000),
    status: "Finalizado",
    finalReport: { filedAt: ts(3000), filedBy: "u1" },
    impact: { personsImpacted: 1200, volunteers: 30, custom: [], closingSummary: "ok" },
    photos: [
      { id: "ph1", url: "https://x/y?token=1", caption: null, uploadedAt: ts(1), uploadedBy: "m1" },
    ],
    roster: { directorId: "m1", coDirectorIds: ["m2"], teamIds: ["m3", "m_missing"] },
    ...over,
  };
}

const names = new Map([
  ["m1", "Ana"],
  ["m2", "Beto"],
  ["m3", "Caro"],
]);
const resolve = (id: string) => names.get(id) ?? null;

describe("projectInitiative", () => {
  it("projects a completed initiative with resolved names + completedAt", () => {
    const item = projectInitiative("Project", "p1", completedDoc(), resolve);
    expect(item).not.toBeNull();
    expect(item!.id).toBe("p1");
    expect(item!.kind).toBe("Project");
    expect(item!.completedAt.toMillis()).toBe(3000);
    expect(item!.team.director).toEqual({ name: "Ana" });
    expect(item!.team.coDirectors).toEqual([{ name: "Beto" }]);
    expect(item!.team.members).toEqual([{ name: "Caro" }]); // m_missing dropped
    expect(item!.impact.personsImpacted).toBe(1200);
    expect(item!.photos).toHaveLength(1);
    expect(item!.photos[0]).toEqual({ id: "ph1", url: "https://x/y?token=1", caption: null });
    expect(item!.photos[0]).not.toHaveProperty("uploadedBy");
  });

  it("returns null when not Finalizado", () => {
    expect(
      projectInitiative("Project", "p1", completedDoc({ status: "EnEjecucion" }), resolve),
    ).toBeNull();
  });

  it("returns null when impact missing", () => {
    expect(projectInitiative("Program", "g1", completedDoc({ impact: null }), resolve)).toBeNull();
  });

  it("returns null when finalReport missing", () => {
    expect(
      projectInitiative("Program", "g1", completedDoc({ finalReport: null }), resolve),
    ).toBeNull();
  });

  it("director null when unresolvable", () => {
    const item = projectInitiative(
      "Project",
      "p1",
      completedDoc({ roster: { directorId: "ghost", coDirectorIds: [], teamIds: [] } }),
      resolve,
    );
    expect(item!.team.director).toBeNull();
  });

  it("drops photos missing a usable id", () => {
    const item = projectInitiative(
      "Project",
      "p1",
      completedDoc({
        photos: [
          { url: "https://x/a", caption: null, uploadedAt: ts(1), uploadedBy: "m1" }, // no id
          { id: "ph2", url: "https://x/b", caption: "ok", uploadedAt: ts(1), uploadedBy: "m1" },
        ],
      }),
      resolve,
    );
    expect(item!.photos).toEqual([{ id: "ph2", url: "https://x/b", caption: "ok" }]);
  });

  it("drops path-unsafe roster ids (no path injection)", () => {
    const item = projectInitiative(
      "Project",
      "p1",
      completedDoc({ roster: { directorId: "a/b", coDirectorIds: ["x__y"], teamIds: ["m3"] } }),
      resolve,
    );
    expect(item!.team.director).toBeNull();
    expect(item!.team.coDirectors).toEqual([]);
    expect(item!.team.members).toEqual([{ name: "Caro" }]);
  });
});

describe("rosterMemberIds", () => {
  it("excludes path-unsafe ids", () => {
    expect(
      rosterMemberIds({
        roster: { directorId: "a/b", coDirectorIds: ["x__y", "m2"], teamIds: ["m3"] },
      }),
    ).toEqual(["m2", "m3"]);
  });
});

describe("activityShowcasePhotos", () => {
  const activity = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    data: {
      parentType: "Project",
      status: "Ejecutada",
      photos: [
        { id: "a", url: "https://x/a?t=1", caption: "hola", uploadedAt: ts(1), uploadedBy: "m1" },
        { id: "b", url: "https://x/b?t=1", caption: null, uploadedAt: ts(1), uploadedBy: "m1" },
      ],
      ...over,
    },
  });

  it("flattens executed activity photos with namespaced ids + preserved captions", () => {
    const photos = activityShowcasePhotos("Project", [activity("act1")]);
    expect(photos).toEqual([
      { id: "act1:a", url: "https://x/a?t=1", caption: "hola" },
      { id: "act1:b", url: "https://x/b?t=1", caption: null },
    ]);
  });

  it("namespaces by activity id so two activities never collide", () => {
    const photos = activityShowcasePhotos("Project", [activity("act1"), activity("act2")]);
    expect(photos.map((p) => p.id)).toEqual(["act1:a", "act1:b", "act2:a", "act2:b"]);
  });

  it("excludes non-Ejecutada activities", () => {
    expect(activityShowcasePhotos("Project", [activity("act1", { status: "Programada" })])).toEqual(
      [],
    );
    expect(activityShowcasePhotos("Project", [activity("act1", { status: "Cancelada" })])).toEqual(
      [],
    );
  });

  it("excludes activities whose parentType differs from the projected kind", () => {
    expect(activityShowcasePhotos("Program", [activity("act1")])).toEqual([]);
  });

  it("drops activity photos missing a usable id", () => {
    const photos = activityShowcasePhotos("Project", [
      activity("act1", {
        photos: [
          { url: "https://x/noid", caption: null, uploadedAt: ts(1), uploadedBy: "m1" },
          { id: "b", url: "https://x/b", caption: null, uploadedAt: ts(1), uploadedBy: "m1" },
        ],
      }),
    ]);
    expect(photos).toEqual([{ id: "act1:b", url: "https://x/b", caption: null }]);
  });

  it("returns [] for an activity with no photos", () => {
    expect(activityShowcasePhotos("Project", [activity("act1", { photos: undefined })])).toEqual(
      [],
    );
  });

  it("drops activities whose doc id is path-unsafe", () => {
    expect(activityShowcasePhotos("Project", [activity("a/b"), activity("a__b")])).toEqual([]);
  });
});

describe("activityParentRefs", () => {
  it("returns the single parent for a created/updated parented activity", () => {
    expect(activityParentRefs(undefined, { parentType: "Program", parentId: "g1" })).toEqual([
      { kind: "Program", id: "g1" },
    ]);
  });

  it("returns the parent from the before-doc on delete", () => {
    expect(activityParentRefs({ parentType: "Project", parentId: "p1" }, undefined)).toEqual([
      { kind: "Project", id: "p1" },
    ]);
  });

  it("dedupes when parent is unchanged across before/after", () => {
    expect(
      activityParentRefs(
        { parentType: "Project", parentId: "p1" },
        { parentType: "Project", parentId: "p1" },
      ),
    ).toEqual([{ kind: "Project", id: "p1" }]);
  });

  it("returns both parents when an activity moves between them", () => {
    expect(
      activityParentRefs(
        { parentType: "Program", parentId: "g1" },
        { parentType: "Project", parentId: "p1" },
      ),
    ).toEqual([
      { kind: "Program", id: "g1" },
      { kind: "Project", id: "p1" },
    ]);
  });

  it("ignores standalone activities (null parent)", () => {
    expect(
      activityParentRefs(
        { parentType: null, parentId: null },
        { parentType: null, parentId: null },
      ),
    ).toEqual([]);
  });

  it("ignores path-unsafe or malformed parent ids", () => {
    expect(activityParentRefs(undefined, { parentType: "Program", parentId: "a/b" })).toEqual([]);
    expect(activityParentRefs(undefined, { parentType: "Bogus", parentId: "g1" })).toEqual([]);
  });
});
