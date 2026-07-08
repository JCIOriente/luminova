import { useNavigate } from "@tanstack/react-router";
import { Button, Icon, NotFoundBackdrop, Numeral404 } from "@luminova/ui";

export function NotFound() {
  const navigate = useNavigate();
  return (
    <section
      style={{
        position: "relative",
        minHeight: "84vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        textAlign: "center",
        background: "var(--jci-black)",
        color: "var(--jci-white)",
      }}
    >
      <NotFoundBackdrop />

      <div
        className="container motion-safe:animate-rise"
        style={{ position: "relative", zIndex: 1 }}
      >
        <div
          className="eyebrow no-rule"
          style={{ color: "var(--jci-teal)", display: "flex", justifyContent: "center" }}
        >
          Error 404
        </div>

        <div style={{ marginTop: 10 }}>
          <Numeral404 fontSize="clamp(120px, 26vw, 280px)" />
        </div>

        <h1
          className="t-title"
          style={{ color: "var(--jci-white)", marginTop: 4, marginBottom: 0 }}
        >
          Página no encontrada
        </h1>
        <p
          className="t-subtitle"
          style={{
            marginTop: 18,
            maxWidth: 540,
            marginLeft: "auto",
            marginRight: "auto",
            color: "rgba(255,255,255,0.74)",
          }}
        >
          La ruta que buscas no existe o cambió de lugar. Volvamos a terreno conocido.
        </p>

        <div
          style={{
            marginTop: 34,
            display: "flex",
            justifyContent: "center",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <Button
            as="button"
            type="button"
            variant="primary"
            onDark
            iconRight={<Icon.arrowRight />}
            onClick={() => void navigate({ to: "/" })}
          >
            Volver al inicio
          </Button>
          <Button
            as="button"
            type="button"
            variant="secondary"
            onDark
            onClick={() => void navigate({ to: "/contact" })}
          >
            Contacto
          </Button>
        </div>

        <p
          style={{
            marginTop: 40,
            fontFamily: "var(--font-serif)",
            fontStyle: "italic",
            fontSize: 15,
            color: "rgba(255,255,255,0.6)",
          }}
        >
          A fire shared never dies.
        </p>
      </div>
    </section>
  );
}
