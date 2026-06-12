import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button, Icon, RippleBackground } from "@luminova/ui";
import { useShowcaseItem } from "../showcase/use-showcase";

export const Route = createFileRoute("/impacto/$id")({
  component: ImpactoDetailPage,
});

function ImpactoDetailPage() {
  const { id } = Route.useParams();
  const { data, loading } = useShowcaseItem(id);
  const navigate = useNavigate();

  return (
    <section
      className="bg-dark"
      style={{
        position: "relative",
        overflow: "hidden",
        minHeight: "84vh",
        display: "flex",
        alignItems: "center",
        paddingTop: 140,
        paddingBottom: 96,
      }}
    >
      <RippleBackground variant="hero" color="#0097D7" />
      <div className="container" style={{ position: "relative", zIndex: 1, width: "100%" }}>
        <div className="eyebrow no-rule" style={{ color: "var(--jci-teal)", display: "flex" }}>
          Impacto
        </div>
        <h1 className="t-display" style={{ marginTop: 20, marginBottom: 0, color: "#fff" }}>
          {loading ? "Cargando…" : (data?.title ?? "Proyecto")}
        </h1>
        <p
          className="t-subtitle"
          style={{ marginTop: 22, maxWidth: 620, color: "rgba(255,255,255,0.78)" }}
        >
          La ficha completa de este proyecto estará disponible pronto.
        </p>
        <div style={{ marginTop: 34 }}>
          <Button
            as="button"
            type="button"
            variant="secondary"
            onDark
            iconRight={<Icon.arrowRight />}
            onClick={() => void navigate({ to: "/impacto" })}
          >
            Volver a Impacto
          </Button>
        </div>
      </div>
    </section>
  );
}
