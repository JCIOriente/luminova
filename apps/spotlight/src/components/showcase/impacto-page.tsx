import { useMemo } from "react";
import { RippleBackground } from "@luminova/ui";
import { useShowcaseList } from "../../showcase/use-showcase";
import { ShowcaseGrid } from "./showcase-grid";
import { ShowcaseCardGrid } from "./showcase-card-grid";
import { formatES } from "./format";

function ImpactoHero({ count, personsImpacted }: { count: number; personsImpacted: number }) {
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
      <RippleBackground variant="hero" />
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
            Un archivo curado de los proyectos que JCI Oriente ha realizado — con su gente, sus
            cifras y su evidencia. Algunos son programas anuales que repetimos cada gestión.
          </p>
        </div>

        {count > 0 && (
          <div style={{ marginTop: 56 }}>
            <div className="mini-stats">
              <div className="mini-stat">
                <div className="v t-num">{formatES(count)}</div>
                <div className="l">proyectos completados</div>
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

export function ImpactoPage() {
  const { data, loading, error } = useShowcaseList();

  const { count, personsImpacted, featured } = useMemo(
    () => ({
      count: data.length,
      personsImpacted: data.reduce((sum, it) => sum + it.impact.personsImpacted, 0),
      featured: data.filter((it) => it.featured),
    }),
    [data],
  );

  return (
    <>
      <ImpactoHero count={count} personsImpacted={personsImpacted} />
      {!loading && !error && featured.length > 0 && (
        <section className="section" aria-label="Proyectos destacados">
          <div className="container">
            <div className="eyebrow">Destacados</div>
            <div style={{ marginTop: 36 }}>
              <ShowcaseCardGrid items={featured} variant="featured" />
            </div>
          </div>
        </section>
      )}
      <section className="section bg-soft">
        <div className="container">
          {loading ? (
            <div
              className="showcase-grid"
              role="status"
              aria-busy="true"
              aria-label="Cargando proyectos"
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="showcase-card-skeleton" />
              ))}
            </div>
          ) : error ? (
            <p className="showcase-empty">
              No pudimos cargar los proyectos en este momento. Vuelve a intentarlo más tarde.
            </p>
          ) : data.length === 0 ? (
            <p className="showcase-empty">
              Pronto compartiremos aquí nuestros proyectos ejecutados.
            </p>
          ) : (
            <>
              <div className="eyebrow">Todos los proyectos</div>
              <div style={{ marginTop: 36 }}>
                <ShowcaseGrid items={data} />
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}
