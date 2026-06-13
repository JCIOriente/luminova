import type { ShowcaseItem } from "@luminova/types/engine";

function NameChips({ people }: { people: ShowcaseItem["team"]["members"] }) {
  return (
    <ul className="team-chips">
      {people.map((person, i) => (
        <li key={`${person.name}-${i}`} className="team-chip">
          {person.name}
        </li>
      ))}
    </ul>
  );
}

export function TeamCredits({ team }: { team: ShowcaseItem["team"] }) {
  const { director, coDirectors, members } = team;
  if (!director && coDirectors.length === 0 && members.length === 0) return null;

  return (
    <div className="team-credits">
      {director && (
        <div className="team-block">
          <span className="team-role t-label">Dirección</span>
          <p className="team-director t-h4">{director.name}</p>
        </div>
      )}
      {coDirectors.length > 0 && (
        <div className="team-block">
          <span className="team-role t-label">Codirección</span>
          <NameChips people={coDirectors} />
        </div>
      )}
      {members.length > 0 && (
        <div className="team-block">
          <span className="team-role t-label">Equipo</span>
          <NameChips people={members} />
        </div>
      )}
    </div>
  );
}
