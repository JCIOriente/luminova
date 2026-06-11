import { Avatar } from "@luminova/ui";
import type { InitiativeTeam, TeamPerson } from "../lib/team";

interface InitiativeTeamRailProps {
  team: InitiativeTeam;
}

export function InitiativeTeamRail({ team }: InitiativeTeamRailProps) {
  const hasCoDirectors = team.coDirectors.length > 0;
  const hasMembers = team.members.length > 0;

  return (
    <aside className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5">
      <h2 className="text-[15px] font-semibold text-ink-1">Equipo</h2>

      {team.director ? (
        <PersonRow
          person={team.director}
          featuredLabel={`Director · ${team.director.role}`}
          featured
        />
      ) : (
        <p className="text-[13px] text-ink-3">Sin director asignado.</p>
      )}

      {hasCoDirectors && (
        <div className="flex flex-col gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-4">
            Co-dirección
          </span>
          {team.coDirectors.map((person) => (
            <PersonRow key={person.id} person={person} />
          ))}
        </div>
      )}

      {hasMembers && (
        <div className="flex flex-col gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-4">
            Integrantes
          </span>
          {team.members.map((person) => (
            <PersonRow key={person.id} person={person} />
          ))}
        </div>
      )}
    </aside>
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
        <span className="text-[14px] font-semibold text-ink-1">{person.name}</span>
        <span className="text-[12px] text-ink-3">{featuredLabel ?? person.role}</span>
      </span>
    </div>
  );
}
