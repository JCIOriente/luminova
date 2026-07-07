import type { ReactNode } from "react";
import { Button } from "./button";
import { EmptyState } from "./empty-state";

/** Error variant of {@link EmptyState}: same centered layout, plus an optional
 *  retry affordance. Omit `onRetry` for non-retryable errors (e.g. a rules
 *  denial). */
export function ErrorState({
  icon,
  title,
  description,
  onRetry,
  retryLabel = "Reintentar",
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <EmptyState
      icon={icon}
      title={title}
      description={description}
      action={
        onRetry && (
          <Button as="button" variant="secondary" onClick={onRetry}>
            {retryLabel}
          </Button>
        )
      }
    />
  );
}
