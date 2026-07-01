import type { Member } from "@luminova/types";
import { Avatar, Icon } from "@luminova/ui";

interface ActivityTeamProps {
  director: Member | null;
  coDirectors: Member[];
}

function ContactButton({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      aria-label={label}
      className="grid size-9 place-items-center rounded-[10px] border border-line text-ink-2 transition-colors hover:border-jci-blue hover:text-ink-1"
    >
      {children}
    </a>
  );
}

function PersonCard({ member }: { member: Member }) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3">
      <Avatar src={member.profilePicture} name={member.name} size={36} />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-[13px] font-semibold text-ink-1">{member.name}</span>
        {member.profession && (
          <span className="truncate text-[12px] text-ink-3">{member.profession}</span>
        )}
      </div>
    </div>
  );
}

export function ActivityTeam({ director, coDirectors }: ActivityTeamProps) {
  if (!director && coDirectors.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-mono text-[10.5px] tracking-[0.12em] text-ink-3 uppercase">
        Equipo organizador
      </h2>

      {director && (
        <div className="flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3">
          <Avatar src={director.profilePicture} name={director.name} size={44} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[15px] font-semibold text-ink-1">{director.name}</span>
            {director.profession && (
              <span className="truncate text-[12px] text-ink-3">{director.profession}</span>
            )}
          </div>
          <span className="hidden rounded-pill bg-jci-blue/10 px-2.5 py-1 font-mono text-[10px] font-semibold tracking-[0.1em] text-jci-blue uppercase sm:inline">
            Dirección
          </span>
          <div className="flex items-center gap-2">
            <ContactButton href={`mailto:${director.email}`} label={`Escribir a ${director.name}`}>
              {Icon.mail({ s: 16 })}
            </ContactButton>
            {director.phone && (
              <ContactButton href={`tel:${director.phone}`} label={`Llamar a ${director.name}`}>
                {Icon.phone({ s: 16 })}
              </ContactButton>
            )}
          </div>
        </div>
      )}

      {coDirectors.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <h3 className="font-mono text-[10px] tracking-[0.12em] text-ink-4 uppercase">
            Codirección · {coDirectors.length}
          </h3>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {coDirectors.map((member) => (
              <PersonCard key={member.id} member={member} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
