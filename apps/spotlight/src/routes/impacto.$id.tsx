import { createFileRoute, Link } from "@tanstack/react-router";
import { RippleBackground, Reveal } from "@luminova/ui";
import { AREA_OF_OPPORTUNITY_LABELS, type ShowcaseItem } from "@luminova/types/engine";
import { useShowcaseItem } from "../showcase/use-showcase";
import { ImpactBand } from "../components/showcase/impact-band";
import { PhotoGallery } from "../components/showcase/photo-gallery";
import { TeamCredits } from "../components/showcase/team-credits";
import { formatDateRange } from "@luminova/utils/datetime";
import { NotFound } from "../components/not-found";

export const Route = createFileRoute("/impacto/$id")({
  component: ImpactoDetailPage,
});

function BackLink({ children }: { children: string }) {
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
    <section className="showcase-detail-hero">
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
        <span className="showcase-detail-area">{areaLabel}</span>
        <h1 className="t-display showcase-detail-title">{item.title}</h1>
        <p className="showcase-detail-dates">{dates}</p>
      </div>
    </section>
  );
}

function DetailContent({ item }: { item: ShowcaseItem }) {
  const { description, team } = item;
  const { closingSummary } = item.impact;
  const descTrimmed = description.trim();
  const summaryTrimmed = closingSummary.trim();
  const showDescription = descTrimmed !== "" && descTrimmed !== summaryTrimmed;
  const hasTeam = team.director !== null || team.coDirectors.length > 0 || team.members.length > 0;

  return (
    <>
      <DetailHero item={item} />

      <section className="section bg-blue" style={{ position: "relative", overflow: "hidden" }}>
        <RippleBackground variant="subtle" color="var(--color-jci-white)" opacity={0.06} />
        <div className="container" style={{ position: "relative", zIndex: 1 }}>
          <ImpactBand impact={item.impact} />
        </div>
      </section>

      {summaryTrimmed !== "" && (
        <section className="section">
          <div className="container">
            <Reveal>
              <div className="eyebrow">El proyecto</div>
              <div className="showcase-detail-summary" style={{ marginTop: 28 }}>
                {showDescription && <p>{description}</p>}
                <p>{closingSummary}</p>
              </div>
            </Reveal>
          </div>
        </section>
      )}

      {item.photos.length > 0 && (
        <section className="section bg-soft">
          <div className="container">
            <div className="eyebrow">Galería</div>
            <div style={{ marginTop: 36 }}>
              <PhotoGallery photos={item.photos} title={item.title} />
            </div>
          </div>
        </section>
      )}

      <section className="section">
        <div className="container">
          {hasTeam && (
            <div className="grid-2" style={{ alignItems: "start" }}>
              <div>
                <div className="eyebrow">Equipo</div>
              </div>
              <TeamCredits team={team} />
            </div>
          )}
          <div style={{ marginTop: hasTeam ? 64 : 0 }}>
            <BackLink>Ver todos los proyectos</BackLink>
          </div>
        </div>
      </section>
    </>
  );
}

function ImpactoDetailPage() {
  const { id } = Route.useParams();
  const { data, loading, error } = useShowcaseItem(id);

  if (loading) {
    return (
      <section className="section">
        <div className="container">
          <div className="showcase-detail-loading" aria-busy="true">
            Cargando…
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="section">
        <div className="container">
          <p className="showcase-empty">
            No pudimos cargar este proyecto en este momento. Vuelve a intentarlo más tarde.
          </p>
          <div style={{ textAlign: "center" }}>
            <BackLink>Volver a Impacto</BackLink>
          </div>
        </div>
      </section>
    );
  }

  if (data === null) return <NotFound />;

  return <DetailContent item={data} />;
}
