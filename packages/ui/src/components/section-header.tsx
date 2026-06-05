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
            "inline-flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.16em] before:block before:h-px before:w-6 before:bg-current",
            onDark ? "text-jci-teal" : "text-jci-blue",
          )}
        >
          {eyebrow}
        </div>
      )}
      {title && (
        <h2 className="mt-4 text-[clamp(32px,4.4vw,48px)] font-normal leading-[1.1] tracking-[-0.015em]">
          {title}
        </h2>
      )}
      {subtitle && (
        <p className="mt-5 text-[clamp(20px,1.7vw,24px)] leading-[1.3] text-ink-2">{subtitle}</p>
      )}
      {children}
    </div>
  );
}
