import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import type { ShowcasePerson } from "@luminova/types/engine";
import {
  activityParentRefs,
  activityProjectionUnchanged,
  activityShowcasePhotos,
  projectInitiative,
  rosterMemberIds,
  showcasePerson,
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

const people = new Map<string, ShowcasePerson>([
  ["m1", { name: "Ana", photoUrl: "https://pics/ana.jpg" }],
  ["m2", { name: "Beto", photoUrl: null }],
  ["m3", { name: "Caro", photoUrl: "https://pics/caro.jpg" }],
]);
const resolve = (id: string) => people.get(id) ?? null;

describe("projectInitiative", () => {
  it("projects a completed initiative with resolved names + completedAt", () => {
    const item = projectInitiative("Project", "p1", completedDoc(), resolve);
    expect(item).not.toBeNull();
    expect(item!.id).toBe("p1");
    expect(item!.kind).toBe("Project");
    expect(item!.completedAt.toMillis()).toBe(3000);
    expect(item!.team.director).toEqual({ name: "Ana", photoUrl: "https://pics/ana.jpg" });
    expect(item!.team.coDirectors).toEqual([{ name: "Beto", photoUrl: null }]);
    // m_missing dropped; Caro keeps her photo
    expect(item!.team.members).toEqual([{ name: "Caro", photoUrl: "https://pics/caro.jpg" }]);
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
    expect(item!.team.members).toEqual([{ name: "Caro", photoUrl: "https://pics/caro.jpg" }]);
  });

  it("projects featured true when the initiative is flagged", () => {
    const item = projectInitiative("Project", "p1", completedDoc({ featured: true }), resolve);
    expect(item!.featured).toBe(true);
  });

  it("projects featured false when the flag is absent or falsy", () => {
    expect(projectInitiative("Project", "p1", completedDoc(), resolve)!.featured).toBe(false);
    expect(
      projectInitiative("Project", "p1", completedDoc({ featured: false }), resolve)!.featured,
    ).toBe(false);
  });
});

describe("showcasePerson", () => {
  it("drops a member with an empty or non-string name (no blank public credit)", () => {
    expect(showcasePerson("", "https://x/p.jpg")).toBeNull();
    expect(showcasePerson(undefined, "https://x/p.jpg")).toBeNull();
    expect(showcasePerson(42, null)).toBeNull();
  });
  it("exposes an https profile photo", () => {
    expect(showcasePerson("Ana", "https://x/p.jpg")).toEqual({
      name: "Ana",
      photoUrl: "https://x/p.jpg",
    });
  });
  it("nulls a non-https or non-string photo (member-controlled, public surface)", () => {
    expect(showcasePerson("Ana", "http://x/p.jpg")).toEqual({ name: "Ana", photoUrl: null });
    expect(showcasePerson("Ana", "javascript:alert(1)")).toEqual({ name: "Ana", photoUrl: null });
    expect(showcasePerson("Ana", null)).toEqual({ name: "Ana", photoUrl: null });
    expect(showcasePerson("Ana", { url: "x" })).toEqual({ name: "Ana", photoUrl: null });
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

  it("drops photos whose own id is not gallery-clean (path-unsafe or contains ':')", () => {
    const photos = activityShowcasePhotos("Project", [
      activity("act1", {
        photos: [
          { id: "x:y", url: "https://x/a", caption: null, uploadedAt: ts(1), uploadedBy: "m1" },
          { id: "a/b", url: "https://x/b", caption: null, uploadedAt: ts(1), uploadedBy: "m1" },
          { id: "ok", url: "https://x/c", caption: null, uploadedAt: ts(1), uploadedBy: "m1" },
        ],
      }),
    ]);
    expect(photos).toEqual([{ id: "act1:ok", url: "https://x/c", caption: null }]);
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

describe("activityProjectionUnchanged", () => {
  const base = () => ({
    parentType: "Project",
    parentId: "p1",
    status: "Ejecutada",
    photos: [{ id: "ph1", url: "https://x/1.jpg", caption: null, uploadedAt: ts(1000) }],
    title: "Actividad",
    hasCheckIns: false,
  });

  it("is unchanged when only non-projected fields differ (hasCheckIns, title)", () => {
    expect(
      activityProjectionUnchanged(base(), { ...base(), hasCheckIns: true, title: "Otro" }),
    ).toBe(true);
  });

  it("is changed when status flips", () => {
    expect(activityProjectionUnchanged(base(), { ...base(), status: "Programada" })).toBe(false);
  });

  it("is changed when photos content differs", () => {
    expect(
      activityProjectionUnchanged(base(), {
        ...base(),
        photos: [{ id: "ph1", url: "https://x/1.jpg", caption: "pie", uploadedAt: ts(1000) }],
      }),
    ).toBe(false);
  });

  it("is changed when the parent moves", () => {
    expect(activityProjectionUnchanged(base(), { ...base(), parentId: "p2" })).toBe(false);
  });

  it("treats create and delete as changed (missing side)", () => {
    expect(activityProjectionUnchanged(undefined, base())).toBe(false);
    expect(activityProjectionUnchanged(base(), undefined)).toBe(false);
  });
});
