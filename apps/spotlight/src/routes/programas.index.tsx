import { createFileRoute } from "@tanstack/react-router";
import { RippleBackground } from "@luminova/ui";
import { useFeaturedList } from "../showcase/use-showcase";
import { ShowcaseCardGrid } from "../components/showcase/showcase-card-grid";

export const Route = createFileRoute("/programas/")({
  component: ProgramasPage,
});

function ProgramasHero() {
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
            Programas
          </div>
          <h1 className="t-display" style={{ marginTop: 20, marginBottom: 0, color: "#fff" }}>
            Programas que transforman.
          </h1>
          <p
            className="t-subtitle"
            style={{ marginTop: 22, maxWidth: 620, color: "rgba(255,255,255,0.78)" }}
          >
            Una selección de los programas y proyectos que mejor representan el trabajo de JCI
            Oriente — los que más orgullo nos dan.
          </p>
        </div>
      </div>
    </section>
  );
}

function ProgramasPage() {
  const { data, loading, error } = useFeaturedList();

  return (
    <>
      <ProgramasHero />
      <section className="section">
        <div className="container">
          {loading ? (
            <div
              className="showcase-grid"
              role="status"
              aria-busy="true"
              aria-label="Cargando programas"
            >
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="showcase-card-skeleton" />
              ))}
            </div>
          ) : error ? (
            <p className="showcase-empty">
              No pudimos cargar los programas en este momento. Vuelve a intentarlo más tarde.
            </p>
          ) : data.length === 0 ? (
            <p className="showcase-empty">
              Pronto destacaremos aquí nuestros programas y proyectos más representativos.
            </p>
          ) : (
            <ShowcaseCardGrid items={data} />
          )}
        </div>
      </section>
    </>
  );
}
