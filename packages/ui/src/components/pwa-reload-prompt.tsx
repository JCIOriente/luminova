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

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jci-white/70";

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

  return (
    <Toast
      message={
        <span className="flex items-center gap-3">
          {needRefresh ? "Nueva versión disponible" : "La app está lista para usarse sin conexión"}
          {needRefresh && (
            <button
              type="button"
              onClick={onReload}
              className={cn(
                "rounded-pill bg-jci-white px-3.5 py-1.5 text-[13px] font-semibold text-jci-black",
                "transition-colors hover:bg-jci-white/90",
                focusRing,
              )}
            >
              Recargar
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Cerrar"
            className={cn(
              "rounded text-on-dark-3 transition-colors hover:text-jci-white",
              focusRing,
            )}
          >
            Cerrar
          </button>
        </span>
      }
    />
  );
}
