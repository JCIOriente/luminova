import { useNavigate } from "@tanstack/react-router";
import { Button, Icon, RippleBackground } from "@luminova/ui";

export function NotFound() {
  const navigate = useNavigate();
  return (
    <section
      style={{
        position: "relative",
        minHeight: "72vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        textAlign: "center",
      }}
    >
      <RippleBackground variant="hero-center" color="#0097D7" opacity={0.08} />
      <div className="container" style={{ position: "relative", zIndex: 1 }}>
        <div
          className="eyebrow no-rule"
          style={{ color: "var(--jci-teal)", display: "flex", justifyContent: "center" }}
        >
          Error 404
        </div>
        <h1 className="t-display" style={{ marginTop: 16, marginBottom: 0 }}>
          Página no encontrada
        </h1>
        <p
          className="t-subtitle"
          style={{
            marginTop: 20,
            maxWidth: 560,
            marginLeft: "auto",
            marginRight: "auto",
            color: "rgba(0,0,0,0.6)",
          }}
        >
          La página que buscas no existe o cambió de lugar.
        </p>
        <div style={{ marginTop: 32, display: "flex", justifyContent: "center" }}>
          <Button
            as="button"
            type="button"
            variant="primary"
            iconRight={<Icon.arrowRight />}
            onClick={() => void navigate({ to: "/" })}
          >
            Volver al inicio
          </Button>
        </div>
      </div>
    </section>
  );
}
