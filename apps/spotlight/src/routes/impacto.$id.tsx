import { createFileRoute } from "@tanstack/react-router";
import { useShowcaseItem } from "../showcase/use-showcase";
import { BackLink, DetailContent } from "../components/showcase/showcase-detail";
import { NotFound } from "../components/not-found";

export const Route = createFileRoute("/impacto/$id")({
  component: ImpactoDetailPage,
});

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
