import { createFileRoute } from "@tanstack/react-router";
import { LogoLockup } from "@luminova/ui";

export const Route = createFileRoute("/")({
  component: BootstrapPlaceholder,
});

function BootstrapPlaceholder() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-surface">
      <LogoLockup />
      <p className="text-ink-2">Backstage bootstrap OK</p>
    </div>
  );
}
