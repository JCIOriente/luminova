import { ErrorState, Icon } from "@luminova/ui";
import { isPermissionDenied } from "../lib/firestore-errors";

/** Presentational error state for a failed read query. Distinguishes a rules
 *  denial (no retry — item-10 `retryQuery` never retries `permission-denied`, so
 *  a retry would just fail again) from a transient failure (offer `refetch`).
 *  Copy is fixed strings — never surfaces `error.message`, a stack, a Firestore
 *  path, or which rule/claim failed. */
export function QueryErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (isPermissionDenied(error)) {
    return (
      <ErrorState
        icon={Icon.lock({ s: 40 })}
        title="Sin permiso"
        description="Tu sesión no tiene permiso para ver esto. Actualiza la sesión e inténtalo de nuevo."
      />
    );
  }
  return (
    <ErrorState
      title="No se pudo cargar"
      description="Ocurrió un problema al cargar la información. Inténtalo de nuevo."
      onRetry={onRetry}
    />
  );
}
