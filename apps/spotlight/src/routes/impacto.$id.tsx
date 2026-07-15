import { createFileRoute } from "@tanstack/react-router";
import { useShowcaseItem } from "../showcase/use-showcase";
import { BackLink, DetailContent } from "../components/showcase/showcase-detail";
import { NotFound } from "../components/not-found";

export const Route = createFileRoute("/impacto/$id")({
  // Kick the detail read off during the route-match phase so a cold deep link
  // stops serializing chunk → mount → fetch. autoCodeSplitting keeps this loader
  // eager, so it runs in parallel with the component chunk download; the dynamic
  // import keeps firestore-lite out of the always-loaded graph, and
  // fetchShowcaseItem dedupes the in-flight promise the component then reuses.
  loader: ({ params }) => {
    void import("../showcase/showcase-firestore").then((m) => m.fetchShowcaseItem(params.id));
  },
  component: ImpactoDetailPage,
});

function ImpactoDetailPage() {
  const { id } = Route.useParams();
  const { data, loading, error } = useShowcaseItem(id);

  // Loading/error render on the same dark backdrop as the loaded hero — the
  // route is in BLUE_HERO_PREFIXES, so the nav is light and needs a dark bg.
  if (loading) {
    return (
      <section className="section bg-dark">
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
      <section className="section bg-dark" style={{ minHeight: "60vh" }}>
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
