import { LogoLockup } from "@luminova/ui";

export function PendingScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface">
      <div className="animate-pulse opacity-70">
        <LogoLockup />
      </div>
    </div>
  );
}
