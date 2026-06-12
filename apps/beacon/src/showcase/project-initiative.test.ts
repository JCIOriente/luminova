import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { projectInitiative } from "./project-initiative.js";

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
    photos: [{ id: "ph1", url: "https://x/y?token=1", caption: null, uploadedAt: ts(1), uploadedBy: "m1" }],
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
  });

  it("returns null when not Finalizado", () => {
    expect(projectInitiative("Project", "p1", completedDoc({ status: "EnEjecucion" }), resolve)).toBeNull();
  });

  it("returns null when impact missing", () => {
    expect(projectInitiative("Program", "g1", completedDoc({ impact: null }), resolve)).toBeNull();
  });

  it("returns null when finalReport missing", () => {
    expect(projectInitiative("Program", "g1", completedDoc({ finalReport: null }), resolve)).toBeNull();
  });

  it("director null when unresolvable", () => {
    const item = projectInitiative("Project", "p1", completedDoc({ roster: { directorId: "ghost", coDirectorIds: [], teamIds: [] } }), resolve);
    expect(item!.team.director).toBeNull();
  });
});
