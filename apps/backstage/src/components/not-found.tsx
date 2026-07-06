import { useNavigate } from "@tanstack/react-router";
import { Button, Icon, LogoLockup, RippleBackground } from "@luminova/ui";

const NUMERAL_GRADIENT = "linear-gradient(180deg, #ffffff 0%, rgba(87,188,188,0.85) 100%)";

export function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-jci-black px-6 text-center text-on-dark-1">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 10%, rgba(0,151,215,0.20), transparent 55%), radial-gradient(70% 60% at 50% 82%, rgba(239,196,15,0.10), transparent 60%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[42%] left-1/2 -z-10 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full motion-safe:animate-pulse"
        style={{ background: "radial-gradient(circle, rgba(239,196,15,0.16), transparent 62%)" }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <RippleBackground variant="hero-center" color="var(--color-jci-teal)" opacity={0.13} />
      </div>

      <div className="motion-safe:animate-rise">
        <LogoLockup variant="inverted" size="sm" />

        <p className="mt-9 font-mono text-ui-2xs tracking-[0.22em] text-jci-blue-75 uppercase">
          Error 404
        </p>

        <div
          aria-hidden="true"
          className="mt-2 font-serif leading-[0.9] tracking-[-0.04em] select-none"
          style={{
            fontSize: "clamp(110px, 22vw, 240px)",
            background: NUMERAL_GRADIENT,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            textShadow: "0 0 60px rgba(0,151,215,0.25)",
          }}
        >
          404
        </div>

        <h1 className="mt-1 text-2xl font-light -tracking-[0.02em] text-on-dark-1">
          Página no encontrada
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-ui-lg leading-relaxed text-on-dark-3">
          Esta ruta no existe o fue movida. Volvamos al panel.
        </p>

        <div className="mt-8 flex justify-center">
          <Button
            as="button"
            type="button"
            variant="primary"
            onDark
            iconRight={<Icon.arrowRight />}
            onClick={() => void navigate({ to: "/" })}
          >
            Volver al panel
          </Button>
        </div>

        <p className="mt-10 font-serif text-sm text-on-dark-3 italic">A fire shared never dies.</p>
      </div>
    </div>
  );
}
