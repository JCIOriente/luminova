import { Link } from "@tanstack/react-router";
import { RippleBackground, Reveal } from "@luminova/ui";
import { AREA_OF_OPPORTUNITY_LABELS, type ShowcaseItem } from "@luminova/types/engine";
import { ImpactBand } from "./impact-band";
import { ProgramFlag } from "./program-flag";
import { PhotoGallery } from "./photo-gallery";
import { TeamCredits } from "./team-credits";
import { formatDateRange } from "@luminova/utils/datetime";

export function BackLink({ children }: { children: string }) {
  return (
    <Link to="/impacto" className="arrow-link-back">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M14 6l-6 6 6 6"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>{children}</span>
    </Link>
  );
}

function DetailHero({ item }: { item: ShowcaseItem }) {
  const cover = item.photos[0]?.url ?? null;
  const areaLabel = AREA_OF_OPPORTUNITY_LABELS[item.category];
  const dates = formatDateRange(item.startDate, item.endDate);

  return (
    <section className={cover ? "showcase-detail-hero" : "showcase-detail-hero no-cover"}>
      {cover ? (
        <>
          <img
            className="showcase-detail-hero-img"
            src={cover}
            alt=""
            aria-hidden="true"
            decoding="async"
            fetchPriority="high"
          />
          <div className="showcase-detail-hero-scrim" aria-hidden="true" />
        </>
      ) : (
        <RippleBackground variant="hero" />
      )}
      <div className="container showcase-detail-hero-body">
        <span className="showcase-detail-area">
          {areaLabel}
          <ProgramFlag kind={item.kind} />
        </span>
        <h1 className="showcase-detail-title">{item.title}</h1>
        <p className="showcase-detail-dates">{dates}</p>
      </div>
    </section>
  );
}

export function DetailContent({ item }: { item: ShowcaseItem }) {
  const { description, team } = item;
  const { closingSummary } = item.impact;
  const descTrimmed = description.trim();
  const summaryTrimmed = closingSummary.trim();
  const showDescription = descTrimmed !== "" && descTrimmed !== summaryTrimmed;
  const hasTeam = team.director !== null || team.coDirectors.length > 0 || team.members.length > 0;
  const isProgram = item.kind === "Program";

  return (
    <>
      <DetailHero item={item} />

      <section className="section bg-blue showcase-detail-impact">
        <RippleBackground variant="subtle" color="var(--color-jci-white)" opacity={0.06} />
        <div className="container showcase-detail-impact-body">
          <div className="eyebrow">Impacto</div>
          <div className="showcase-detail-band-wrap">
            <ImpactBand impact={item.impact} />
          </div>
        </div>
      </section>

      {summaryTrimmed !== "" && (
        <section className="section">
          <div className="container">
            <Reveal>
              <div className="detail-rail">
                <div className="eyebrow">{isProgram ? "El programa" : "El proyecto"}</div>
                <div className="showcase-detail-summary">
                  {showDescription && <p>{description}</p>}
                  <p>{closingSummary}</p>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      )}

      {item.photos.length > 0 && (
        <section className="section bg-soft">
          <div className="container">
            <div className="detail-section-head">
              <div className="eyebrow">Galería</div>
              <span className="detail-count">
                {item.photos.length} {item.photos.length === 1 ? "foto" : "fotos"}
              </span>
            </div>
            <div className="detail-section-body">
              <PhotoGallery photos={item.photos} title={item.title} />
            </div>
          </div>
        </section>
      )}

      {hasTeam && (
        <section className="section">
          <div className="container">
            <Reveal>
              <div className="team-header">
                <div className="eyebrow">Equipo</div>
                <h2 className="team-heading">
                  Las personas detrás {isProgram ? "del programa" : "del proyecto"}
                </h2>
              </div>
              <TeamCredits team={team} />
            </Reveal>
          </div>
        </section>
      )}

      <section className="detail-footer">
        <div className="container">
          <div className="detail-footer-rule">
            <BackLink>Ver todos los proyectos</BackLink>
          </div>
        </div>
      </section>
    </>
  );
}
