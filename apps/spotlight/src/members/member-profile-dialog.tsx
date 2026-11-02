import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Dialog, ErrorState, Icon, cn, initials } from "@luminova/ui";
import type { MemberProjectRole, MemberShowcaseItem } from "@luminova/types/engine";
import { formatES } from "../components/showcase/format";
import { fetchMember } from "./member-showcase-firestore";
import "./member-profile.css";

type Load =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; member: MemberShowcaseItem | null };

const ROLE_LABELS: Record<MemberProjectRole, string> = {
  Director: "Dirección",
  CoDirector: "Codirección",
  Team: "Equipo",
};

/** A short history gets the small card: a tall panel beside two rows reads as empty. */
function isBrief(member: MemberShowcaseItem): boolean {
  return !member.bio && member.career.length <= 1 && member.projects.length <= 2;
}

function eyebrow(member: MemberShowcaseItem): string {
  const latest = member.career[0];
  return latest ? `${latest.title} · Gestión ${latest.year}` : "Miembro";
}

function subtitle(member: MemberShowcaseItem): string {
  const since = member.joinYear ? `Miembro desde ${member.joinYear}` : null;
  return [member.profession, since].filter(Boolean).join(" · ");
}

function Identity({ member }: { member: MemberShowcaseItem }) {
  return (
    <div className="member-identity">
      <p className="member-eyebrow">{eyebrow(member)}</p>
      <h2 className="member-name">{member.name}</h2>
      <p className="member-subtitle">{subtitle(member)}</p>
    </div>
  );
}

function Panel({ member, brief }: { member: MemberShowcaseItem; brief: boolean }) {
  return (
    <div className="member-panel">
      {member.joinYear && (
        <div className="member-ghost-year t-num" aria-hidden>
          {member.joinYear}
        </div>
      )}
      {member.portraitUrl ? (
        <img
          className="member-portrait"
          src={member.portraitUrl}
          alt={`Retrato de ${member.name}`}
          decoding="async"
        />
      ) : (
        <span className="member-initials" aria-hidden>
          {initials(member.name)}
        </span>
      )}
      {!brief && <Identity member={member} />}
      {member.linkedinUrl && (
        <a
          className="member-linkedin"
          href={member.linkedinUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`LinkedIn de ${member.name}`}
        >
          <Icon.linkedin />
          <span>LinkedIn</span>
        </a>
      )}
    </div>
  );
}

function Stats({ member }: { member: MemberShowcaseItem }) {
  const years = member.joinYear ? new Date().getUTCFullYear() - member.joinYear : 0;
  const led = member.projects.filter((p) => p.role !== "Team").length;
  const total = member.projects.length;
  // A zero is left out: this card recognizes what a member has done, not what they have not.
  const stats = [
    { value: years, label: years === 1 ? "año en JCI" : "años en JCI" },
    { value: led, label: led === 1 ? "proyecto dirigido" : "proyectos dirigidos" },
    { value: total, label: total === 1 ? "proyecto en total" : "proyectos en total" },
  ].filter((stat) => stat.value > 0);
  if (stats.length === 0) return null;
  return (
    <dl className="member-stats">
      {stats.map((stat) => (
        <div key={stat.label} className="member-stat">
          <dt>{stat.label}</dt>
          <dd className="t-num">{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Sheet({ member, brief }: { member: MemberShowcaseItem; brief: boolean }) {
  return (
    <div className="member-sheet">
      {brief && <Identity member={member} />}
      {(member.isPastPresident || member.bio) && (
        <div className="member-intro">
          {member.isPastPresident && <span className="member-badge">Past President</span>}
          {member.bio && <blockquote className="member-bio">“{member.bio}”</blockquote>}
        </div>
      )}
      {!brief && <Stats member={member} />}
      {member.career.length > 0 && (
        <section className="member-section">
          <h3 className="member-section-title">Trayectoria</h3>
          <ol className="member-rows">
            {member.career.map((entry) => (
              <li key={entry.year} className="member-career-row">
                <span className="member-year t-num">{entry.year}</span>
                <span className="member-career-title">{entry.title}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
      {member.projects.length > 0 && (
        <section className="member-section">
          <h3 className="member-section-title">Proyectos</h3>
          <ul className="member-rows">
            {member.projects.map((project) => (
              <li key={project.id}>
                <Link
                  to="/impacto/$id"
                  params={{ id: project.id }}
                  search={(prev) => ({ ...prev, miembro: undefined })}
                  className="member-project-row"
                >
                  <span className="member-year t-num">{project.year}</span>
                  <span className="member-project-text">
                    <span className="member-project-title">{project.title}</span>
                    {project.personsImpacted > 0 && (
                      <span className="member-project-impact">
                        {formatES(project.personsImpacted)} personas impactadas
                      </span>
                    )}
                  </span>
                  <span
                    className={cn("member-role", project.role !== "Team" && "member-role-lead")}
                  >
                    {ROLE_LABELS[project.role]}
                  </span>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M7 17 17 7" />
                    <path d="M8 7h9v9" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div className="member-loading" aria-busy="true">
      <div className="member-loading-panel" />
      <div className="member-loading-sheet">
        <div className="animate-skeleton member-loading-line" />
        <div className="animate-skeleton member-loading-title" />
        <div className="animate-skeleton member-loading-line" />
      </div>
    </div>
  );
}

function Unavailable() {
  return (
    <div className="member-unavailable">
      <h2 className="member-unavailable-title">Este perfil no está disponible</h2>
      <p>Puede que esta persona haya elegido no mostrar su perfil en el sitio.</p>
    </div>
  );
}

export function MemberProfileDialog({
  memberId,
  onClose,
}: {
  memberId: string;
  onClose: () => void;
}) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    fetchMember(memberId).then(
      (member) => {
        if (current) setLoad({ status: "ready", member });
      },
      (err: unknown) => {
        console.error("member profile read failed", { memberId, err });
        if (current) setLoad({ status: "error" });
      },
    );
    return () => {
      current = false;
    };
  }, [memberId, attempt]);

  const member = load.status === "ready" ? load.member : null;
  const brief = member ? isBrief(member) : false;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={member ? `Perfil de ${member.name}` : "Perfil de miembro"}
      description={member ? `Trayectoria de ${member.name}` : "Trayectoria de un miembro"}
      hideHeader
      overlayClassName="member-overlay"
      contentClassName={cn("member-dialog", (!member || brief) && "member-dialog-brief")}
      bodyClassName="member-dialog-body"
    >
      {load.status === "loading" && <Loading />}
      {load.status === "error" && (
        <ErrorState
          title="No se pudo cargar el perfil"
          description="Revisa tu conexión e inténtalo de nuevo."
          onRetry={() => {
            setLoad({ status: "loading" });
            setAttempt((n) => n + 1);
          }}
        />
      )}
      {load.status === "ready" && !member && <Unavailable />}
      {member && (
        <div className="member-layout">
          <Panel member={member} brief={brief} />
          <Sheet member={member} brief={brief} />
        </div>
      )}
      <button type="button" className="member-close" aria-label="Cerrar" onClick={onClose}>
        <Icon.close />
      </button>
    </Dialog>
  );
}
