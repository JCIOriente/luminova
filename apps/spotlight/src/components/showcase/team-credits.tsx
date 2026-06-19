import type { ShowcaseItem, ShowcasePerson } from "@luminova/types/engine";

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

function Avatar({ person, size }: { person: ShowcasePerson; size: "lg" | "sm" }) {
  const cls = size === "lg" ? "team-avatar team-avatar-lg" : "team-avatar";
  if (person.photoUrl) {
    return <img className={cls} src={person.photoUrl} alt="" loading="lazy" />;
  }
  return (
    <span className={`${cls} team-avatar-fallback`} aria-hidden="true">
      {initials(person.name)}
    </span>
  );
}

function Roster({ people }: { people: ShowcasePerson[] }) {
  return (
    <ul className="team-roster">
      {people.map((person, i) => (
        <li key={`${person.name}-${i}`} className="team-member">
          <Avatar person={person} size="sm" />
          <span className="team-member-name">{person.name}</span>
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
        <div className="team-lead">
          <Avatar person={director} size="lg" />
          <div className="team-lead-meta">
            <span className="team-role t-label">Dirección</span>
            <p className="team-lead-name t-h4">{director.name}</p>
          </div>
        </div>
      )}
      {coDirectors.length > 0 && (
        <div className="team-block">
          <span className="team-role t-label">Codirección</span>
          <Roster people={coDirectors} />
        </div>
      )}
      {members.length > 0 && (
        <div className="team-block">
          <span className="team-role t-label">Equipo</span>
          <Roster people={members} />
        </div>
      )}
    </div>
  );
}
