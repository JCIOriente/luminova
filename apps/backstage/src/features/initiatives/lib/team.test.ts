import { describe, it, expect } from "vitest";
import type { Member } from "@luminova/types";
import { buildInitiativeTeam } from "./team";

const m = (id: string, name: string, profession: string): Member =>
  ({ id, name, profession, profilePicture: null }) as unknown as Member;

describe("buildInitiativeTeam", () => {
  it("resolves director, co-directors, team and skips unknown ids", () => {
    const byId = new Map<string, Member>([
      ["d", m("d", "Dir", "Presidente")],
      ["c", m("c", "Co", "VP")],
      ["t", m("t", "Team", "Miembro")],
    ]);
    const team = buildInitiativeTeam(
      { directorId: "d", coDirectorIds: ["c", "ghost"], teamIds: ["t"] },
      byId,
    );
    expect(team.director?.name).toBe("Dir");
    expect(team.director?.role).toBe("Presidente");
    expect(team.coDirectors.map((p) => p.id)).toEqual(["c"]);
    expect(team.members.map((p) => p.id)).toEqual(["t"]);
  });

  it("returns null director when missing", () => {
    const team = buildInitiativeTeam(
      { directorId: "x", coDirectorIds: [], teamIds: [] },
      new Map(),
    );
    expect(team.director).toBeNull();
  });
});
