import { useNavigate } from "@tanstack/react-router";
import { Button, Icon, RippleBackground } from "@luminova/ui";

const NUMERAL_GRADIENT = "linear-gradient(180deg, #ffffff 0%, rgba(87,188,188,0.85) 100%)";

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
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(120% 90% at 50% 12%, rgba(0,151,215,0.20), transparent 55%), radial-gradient(70% 60% at 50% 80%, rgba(239,196,15,0.10), transparent 60%)",
        }}
      />
      <div
        aria-hidden="true"
        className="motion-safe:animate-pulse"
        style={{
          position: "absolute",
          left: "50%",
          top: "43%",
          width: 440,
          height: 440,
          transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, rgba(239,196,15,0.18), transparent 62%)",
          filter: "blur(6px)",
        }}
      />
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <RippleBackground variant="hero-center" color="#57BCBC" opacity={0.13} />
      </div>

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

        <div
          aria-hidden="true"
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "clamp(120px, 26vw, 280px)",
            lineHeight: 0.9,
            letterSpacing: "-0.04em",
            marginTop: 10,
            background: NUMERAL_GRADIENT,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            textShadow: "0 0 60px rgba(0,151,215,0.25)",
          }}
        >
          404
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
