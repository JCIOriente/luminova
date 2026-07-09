import { useNavigate } from "@tanstack/react-router";
import { Button, Icon, LogoLockup, NotFoundBackdrop, Numeral404 } from "@luminova/ui";

export function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-jci-black px-6 text-center text-on-dark-1">
      <NotFoundBackdrop />

      <div className="relative motion-safe:animate-rise">
        <LogoLockup variant="inverted" size="sm" />

        <p className="mt-9 font-mono text-ui-2xs tracking-[0.22em] text-jci-blue-75 uppercase">
          Error 404
        </p>

        <Numeral404 fontSize="clamp(110px, 22vw, 240px)" className="mt-2" />

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
