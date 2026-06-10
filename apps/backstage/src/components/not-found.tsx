import { useNavigate } from "@tanstack/react-router";
import { Button, LogoLockup } from "@luminova/ui";

export function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-7 bg-surface px-6 text-center">
      <LogoLockup />
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-jci-blue">Error 404</p>
        <h1 className="mt-3 text-3xl font-light -tracking-[0.02em] text-ink-1">
          Página no encontrada
        </h1>
        <p className="mt-3 max-w-sm text-ink-3">La página que buscas no existe o fue movida.</p>
      </div>
      <Button
        as="button"
        type="button"
        variant="primary"
        onClick={() => void navigate({ to: "/" })}
      >
        Volver al panel
      </Button>
    </div>
  );
}
