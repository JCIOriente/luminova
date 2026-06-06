import type { ReactNode } from "react";
import { cn } from "@luminova/ui";

/** Square icon-only button for table row actions. `danger` tints the hover red. */
export function RowAction({
  icon,
  label,
  onClick,
  variant = "default",
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  variant?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "flex size-8 items-center justify-center rounded-[8px] text-ink-3 transition-colors",
        variant === "danger"
          ? "hover:bg-error/10 hover:text-error"
          : "hover:bg-ink-1/[0.04] hover:text-ink-1",
      )}
    >
      {icon}
    </button>
  );
}
