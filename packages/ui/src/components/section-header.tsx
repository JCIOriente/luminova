import type { ReactNode } from "react";
import { cn } from "../lib/cn";

interface SectionHeaderProps {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  align?: "left" | "center";
  onDark?: boolean;
  children?: ReactNode;
}

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  align = "left",
  onDark = false,
  children,
}: SectionHeaderProps) {
  return (
    <div className={cn("max-w-[760px]", align === "center" && "mx-auto text-center")}>
      {eyebrow && (
        <div
          className={cn(
            "inline-flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.16em] before:block before:h-px before:w-[26px] before:bg-current",
            onDark ? "text-jci-teal" : "text-jci-blue",
            align === "center" && "after:block after:h-px after:w-[26px] after:bg-current",
          )}
        >
          {eyebrow}
        </div>
      )}
      {title && (
        <h2
          className={cn(
            "mt-4 text-[clamp(30px,4vw,44px)] font-normal leading-[1.1] tracking-[-0.015em]",
            onDark && "text-white",
          )}
        >
          {title}
        </h2>
      )}
      {subtitle && (
        <p
          className={cn(
            "mt-4 text-[clamp(18px,1.6vw,22px)] leading-[1.35] text-ink-2",
            onDark && "text-white/[0.78]",
          )}
        >
          {subtitle}
        </p>
      )}
      {children}
    </div>
  );
}
