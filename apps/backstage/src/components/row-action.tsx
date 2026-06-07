import type { ReactNode } from "react";
import { IconButton } from "@luminova/ui";

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
    <IconButton
      as="button"
      aria-label={label}
      onClick={onClick}
      size="sm"
      variant={variant === "danger" ? "danger" : "subtle"}
    >
      {icon}
    </IconButton>
  );
}
