import { initials } from "@luminova/ui";
import type { ShowcaseItem, ShowcasePerson } from "@luminova/types/engine";
import { MemberLink } from "../../members/member-link";

type AvatarSize = "lg" | "md" | "sm";

function Avatar({ person, size }: { person: ShowcasePerson; size: AvatarSize }) {
  const cls = `team-avatar team-avatar-${size}`;
  if (person.photoUrl) {
    return <img className={cls} src={person.photoUrl} alt="" loading="lazy" decoding="async" />;
  }
  return (
    <span className={`${cls} team-avatar-fallback`} aria-hidden="true">
      {initials(person.name)}
    </span>
  );
}

function PersonName({ person, className }: { person: ShowcasePerson; className: string }) {
  if (!person.id) return <span className={className}>{person.name}</span>;
  return (
    <MemberLink memberId={person.id} name={person.name} className={className}>
      {person.name}
    </MemberLink>
  );
}

function Roster({ people, size = "sm" }: { people: ShowcasePerson[]; size?: AvatarSize }) {
  return (
    <ul className="team-roster">
      {people.map((person, i) => (
        <li key={`${person.name}-${i}`} className="team-member">
          <Avatar person={person} size={size} />
          <PersonName person={person} className="team-member-name" />
        </li>
      ))}
    </ul>
  );
}

export function TeamCredits({ team }: { team: ShowcaseItem["team"] }) {
  const { director, coDirectors, members } = team;
  if (!director && coDirectors.length === 0 && members.length === 0) return null;
  const split = coDirectors.length > 0 && members.length > 0;

  return (
    <div className="team-credits">
      {director && (
        <div className="team-lead">
          <Avatar person={director} size="lg" />
          <div className="team-lead-meta">
            <span className="team-role t-label">Dirección</span>
            <p className="team-lead-name">
              <PersonName person={director} className="team-lead-link" />
            </p>
          </div>
        </div>
      )}
      {(coDirectors.length > 0 || members.length > 0) && (
        <div className={split ? "team-columns team-columns-split" : "team-columns"}>
          {coDirectors.length > 0 && (
            <div className="team-block">
              <span className="team-role t-label">Codirección</span>
              <Roster people={coDirectors} size="md" />
            </div>
          )}
          {members.length > 0 && (
            <div className="team-block">
              <span className="team-role t-label">Equipo</span>
              <Roster people={members} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
