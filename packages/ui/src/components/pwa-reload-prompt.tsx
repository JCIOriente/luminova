import { Toast } from "./toast";
import { cn } from "../lib/cn";

interface PWAReloadPromptProps {
  /** A new service worker is waiting — the app can update. */
  needRefresh: boolean;
  /** The service worker finished precaching — the app works offline now. */
  offlineReady: boolean;
  /** Activate the waiting worker and reload to the fresh build. */
  onReload: () => void;
  /** Dismiss the current prompt (clears needRefresh / offlineReady). */
  onDismiss: () => void;
}

/**
 * Presentational PWA update / offline-ready prompt. State comes from the app's
 * `useRegisterSW` (the `virtual:pwa-register/react` module is app-scoped and
 * can't be imported from this shared package), so this component only renders
 * the toast and reports the user's choice back through the callbacks.
 */
export function PWAReloadPrompt({
  needRefresh,
  offlineReady,
  onReload,
  onDismiss,
}: PWAReloadPromptProps) {
  if (!needRefresh && !offlineReady) return null;

  if (needRefresh) {
    return (
      <Toast
        message={
          <span className="flex items-center gap-3">
            Nueva versión disponible
            <button
              type="button"
              onClick={onReload}
              className={cn(
                "rounded-pill bg-jci-white px-3.5 py-1.5 text-[13px] font-semibold text-jci-black",
                "transition-colors hover:bg-jci-white/90",
              )}
            >
              Recargar
            </button>
            <DismissButton onDismiss={onDismiss} />
          </span>
        }
      />
    );
  }

  return (
    <Toast
      message={
        <span className="flex items-center gap-3">
          La app está lista para usarse sin conexión
          <DismissButton onDismiss={onDismiss} />
        </span>
      }
    />
  );
}

function DismissButton({ onDismiss }: { onDismiss: () => void }) {
  return (
    <button
      type="button"
      onClick={onDismiss}
      aria-label="Cerrar"
      className="text-on-dark-3 transition-colors hover:text-jci-white"
    >
      Cerrar
    </button>
  );
}
