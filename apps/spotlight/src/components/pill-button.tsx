import type { AnchorHTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

type PillVariant = "primary" | "secondary" | "ghost";

interface PillButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: PillVariant;
  size?: "sm" | "md";
  onDark?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  children: ReactNode;
}

export function PillButton({
  variant = "primary",
  size = "md",
  onDark = false,
  className,
  iconLeft,
  iconRight,
  children,
  href = "#",
  ...rest
}: PillButtonProps) {
  const cls = clsx(
    "btn",
    `btn-${variant}`,
    size === "sm" && "btn-sm",
    onDark && "on-dark",
    className,
  );
  return (
    <a href={href} className={cls} {...rest}>
      {iconLeft}
      <span>{children}</span>
      {iconRight}
    </a>
  );
}
