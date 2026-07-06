import { Avatar, Card } from "@luminova/ui";
import type { InitiativeTeam, TeamPerson } from "../lib/team";

interface InitiativeTeamRailProps {
  team: InitiativeTeam;
}

export function InitiativeTeamRail({ team }: InitiativeTeamRailProps) {
  const hasCoDirectors = team.coDirectors.length > 0;
  const hasMembers = team.members.length > 0;

  return (
    <Card as="aside" className="flex flex-col gap-4">
      <h2 className="text-ui-lg font-semibold text-ink-1">Equipo</h2>

      {team.director ? (
        <PersonRow
          person={team.director}
          featuredLabel={`Director · ${team.director.role}`}
          featured
        />
      ) : (
        <p className="text-ui-sm text-ink-3">Sin director asignado.</p>
      )}

      {hasCoDirectors && (
        <div className="flex flex-col gap-3">
          <span className="text-ui-2xs font-semibold uppercase tracking-wide text-ink-4">
            Co-dirección
          </span>
          {team.coDirectors.map((person) => (
            <PersonRow key={person.id} person={person} />
          ))}
        </div>
      )}

      {hasMembers && (
        <div className="flex flex-col gap-3">
          <span className="text-ui-2xs font-semibold uppercase tracking-wide text-ink-4">
            Integrantes
          </span>
          {team.members.map((person) => (
            <PersonRow key={person.id} person={person} />
          ))}
        </div>
      )}
    </Card>
  );
}

interface PersonRowProps {
  person: TeamPerson;
  featured?: boolean;
  featuredLabel?: string;
}

function PersonRow({ person, featured = false, featuredLabel }: PersonRowProps) {
  return (
    <div className="flex items-center gap-3">
      <Avatar src={person.profilePicture} name={person.name} size={featured ? 44 : 36} />
      <span className="flex flex-col">
        <span className="text-ui-md font-semibold text-ink-1">{person.name}</span>
        <span className="text-ui-xs text-ink-3">{featuredLabel ?? person.role}</span>
      </span>
    </div>
  );
}
