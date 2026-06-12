import { createFileRoute } from "@tanstack/react-router";
import { RippleBackground } from "@luminova/ui";
import { useShowcaseList } from "../showcase/use-showcase";
import { ShowcaseGrid } from "../components/showcase/showcase-grid";
import { formatES } from "../components/showcase/showcase-card";

export const Route = createFileRoute("/impacto/")({
  component: ImpactoPage,
});

function ImpactoHero({
  count,
  personsImpacted,
}: {
  count: number;
  personsImpacted: number;
}) {
  return (
    <section
      className="bg-dark"
      style={{
        position: "relative",
        overflow: "hidden",
        paddingTop: 140,
        paddingBottom: 96,
        display: "flex",
        alignItems: "center",
      }}
    >
      <RippleBackground variant="hero" color="#0097D7" />
      <div className="container" style={{ position: "relative", zIndex: 1, width: "100%" }}>
        <div style={{ maxWidth: 920 }}>
          <div className="eyebrow no-rule" style={{ color: "var(--jci-teal)", display: "flex" }}>
            Impacto
          </div>
          <h1 className="t-display" style={{ marginTop: 20, marginBottom: 0, color: "#fff" }}>
            Lo que construimos juntos.
          </h1>
          <p
            className="t-subtitle"
            style={{ marginTop: 22, maxWidth: 620, color: "rgba(255,255,255,0.78)" }}
          >
            Un archivo curado de los proyectos y programas que JCI Oriente ha completado — con su
            gente, sus cifras y su evidencia.
          </p>
        </div>

        {count > 0 && (
          <div style={{ marginTop: 56 }}>
            <div className="mini-stats">
              <div className="mini-stat">
                <div className="v t-num">{formatES(count)}</div>
                <div className="l">iniciativas completadas</div>
              </div>
              <div className="mini-stat">
                <div className="v t-num">{formatES(personsImpacted)}</div>
                <div className="l">personas impactadas en total</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function ImpactoPage() {
  const { data, loading, error } = useShowcaseList();

  const count = data.length;
  const personsImpacted = data.reduce((sum, it) => sum + it.impact.personsImpacted, 0);

  return (
    <>
      <ImpactoHero count={count} personsImpacted={personsImpacted} />
      <section className="section">
        <div className="container">
          {loading ? (
            <div className="showcase-grid" aria-busy="true">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="showcase-card-skeleton" />
              ))}
            </div>
          ) : error ? (
            <p className="showcase-empty">
              No pudimos cargar los proyectos en este momento. Vuelve a intentarlo más tarde.
            </p>
          ) : (
            <ShowcaseGrid items={data} />
          )}
        </div>
      </section>
    </>
  );
}
