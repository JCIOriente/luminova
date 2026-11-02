import { describe, it, expect } from "vitest";
import {
  careerCargoIds,
  memberProjectionUnchanged,
  projectMember,
  type MemberProjectSource,
} from "./project-member.js";
import type { BoardCargo } from "./project-board.js";

const PROJECT = "jci-oriente";
const PHOTO = `https://firebasestorage.googleapis.com/v0/b/${PROJECT}.appspot.com/o/members%2Fm1%2Fprofile.jpg?alt=media&token=t`;

const stamp = (iso: string) => ({ toDate: () => new Date(iso), toMillis: () => Date.parse(iso) });

const member = {
  name: "Ana Rojas",
  profilePicture: PHOTO,
  publicProfile: true,
  uid: "auth-uid-1",
  gender: "Femenino",
  active: true,
  deletedAt: null,
  profession: "Abogada",
  joinDate: stamp("2019-03-01T00:00:00Z"),
  bio: "Dirijo para aprender.",
  linkedinUrl: "https://www.linkedin.com/in/ana-rojas",
  isPastPresident: true,
  email: "ana@example.com",
  phone: "71234567",
  birthdate: stamp("1990-01-01T00:00:00Z"),
  totalPoints: 900,
  positions: {
    "2024": { cargoId: "secretary", comisionIds: [] },
    "2026": { cargoId: "president", comisionIds: ["c1"] },
    "2025": { cargoId: null, comisionIds: [] },
  },
};

const cargos = new Map<string, BoardCargo>([
  ["president", { category: "CEL", title: "Presidente", titleFemale: "Presidenta" }],
  ["secretary", { category: "CEL", title: "Secretario", titleFemale: null }],
]);

const projectSource = (over: Partial<MemberProjectSource> = {}): MemberProjectSource => ({
  id: "p1",
  title: "Agua Segura",
  endDate: stamp("2025-06-01T12:00:00Z"),
  impact: { personsImpacted: 120 },
  team: { director: { id: "m1" }, coDirectors: [], members: [] },
  ...over,
});

const project = (m: Record<string, unknown>, projects: MemberProjectSource[] = []) =>
  projectMember("m1", m, cargos, projects, PROJECT);

describe("projectMember", () => {
  it("projects exactly the public allow-list", () => {
    expect(project(member, [projectSource()])).toEqual({
      id: "m1",
      name: "Ana Rojas",
      portraitUrl: PHOTO,
      profession: "Abogada",
      joinYear: 2019,
      bio: "Dirijo para aprender.",
      linkedinUrl: "https://www.linkedin.com/in/ana-rojas",
      isPastPresident: true,
      career: [
        { year: "2026", title: "Presidenta" },
        { year: "2024", title: "Secretaria" },
      ],
      projects: [
        { id: "p1", title: "Agua Segura", year: 2025, role: "Director", personsImpacted: 120 },
      ],
    });
  });

  it.each([
    ["opted out", { publicProfile: false }],
    ["never decided", { publicProfile: undefined }],
    ["no reachable opt-out", { uid: undefined }],
    ["soft-deleted", { deletedAt: stamp("2026-01-01T00:00:00Z") }],
    ["inactive doc", { active: false }],
    ["expelled", { status: "Desafiliado" }],
    ["nameless", { name: "" }],
  ])("publishes nothing when %s", (_label, over) => {
    expect(project({ ...member, ...over })).toBeNull();
  });

  it("keeps a member with no photo, which is the difference from the board", () => {
    expect(project({ ...member, profilePicture: null })?.portraitUrl).toBeNull();
  });

  it("drops a portrait that is not this member's own object", () => {
    const foreign = PHOTO.replace("m1", "m2");
    expect(project({ ...member, profilePicture: foreign })?.portraitUrl).toBeNull();
  });

  it("drops a non-LinkedIn URL and an overlong or blank bio", () => {
    const item = project({
      ...member,
      linkedinUrl: "https://evil.example/in/ana",
      bio: "x".repeat(181),
    });
    expect(item?.linkedinUrl).toBeNull();
    expect(item?.bio).toBeNull();
    expect(project({ ...member, bio: "   " })?.bio).toBeNull();
  });

  it("skips a term whose cargo doc is missing", () => {
    const item = project({
      ...member,
      positions: { "2023": { cargoId: "gone" }, "2026": { cargoId: "president" } },
    });
    expect(item?.career).toEqual([{ year: "2026", title: "Presidenta" }]);
  });

  it("labels the role by the strongest seat and orders projects newest first", () => {
    const item = project(member, [
      projectSource({
        id: "old",
        endDate: stamp("2022-06-01T12:00:00Z"),
        team: { director: null, coDirectors: [], members: [{ id: "m1" }] },
      }),
      projectSource({
        id: "new",
        team: { director: { id: "x" }, coDirectors: [{ id: "m1" }], members: [{ id: "m1" }] },
      }),
    ]);
    expect(item?.projects.map((p) => [p.id, p.role])).toEqual([
      ["new", "CoDirector"],
      ["old", "Team"],
    ]);
  });

  it("drops a project the member no longer holds a seat on", () => {
    const stale = projectSource({
      team: { director: { id: "x" }, coDirectors: [], members: [] },
    });
    expect(project(member, [stale])?.projects).toEqual([]);
  });
});

describe("careerCargoIds", () => {
  it("returns safe distinct cargo ids and ignores malformed terms", () => {
    const ids = careerCargoIds({
      positions: {
        "2024": { cargoId: "a" },
        "2025": { cargoId: "a" },
        "2026": { cargoId: "b/c" },
        "2027": null,
      },
    });
    expect(ids).toEqual(["a"]);
  });

  it("is empty without positions", () => {
    expect(careerCargoIds({})).toEqual([]);
  });
});

describe("memberProjectionUnchanged", () => {
  it("skips a points mirror write", () => {
    expect(memberProjectionUnchanged(member, { ...member, totalPoints: 950 })).toBe(true);
  });

  it.each(["publicProfile", "name", "bio", "linkedinUrl", "active", "deletedAt", "status", "uid"])(
    "re-projects when %s changes",
    (field) => {
      expect(memberProjectionUnchanged(member, { ...member, [field]: "changed" })).toBe(false);
    },
  );

  it("treats a create or delete as changed", () => {
    expect(memberProjectionUnchanged(undefined, member)).toBe(false);
    expect(memberProjectionUnchanged(member, undefined)).toBe(false);
  });
});
