import type { InitiativeRoster, Member } from "@luminova/types";

export interface TeamPerson {
  id: string;
  name: string;
  role: string;
  profilePicture: string | null;
}

export interface InitiativeTeam {
  director: TeamPerson | null;
  coDirectors: TeamPerson[];
  members: TeamPerson[];
}

function resolve(ids: string[], byId: Map<string, Member>): TeamPerson[] {
  return ids
    .map((id) => byId.get(id))
    .filter((m): m is Member => Boolean(m))
    .map((m) => ({
      id: m.id,
      name: m.name,
      role: m.profession ?? "",
      profilePicture: m.profilePicture,
    }));
}

export function buildInitiativeTeam(
  roster: InitiativeRoster,
  byId: Map<string, Member>,
): InitiativeTeam {
  return {
    director: resolve([roster.directorId], byId)[0] ?? null,
    coDirectors: resolve(roster.coDirectorIds, byId),
    members: resolve(roster.teamIds, byId),
  };
}
