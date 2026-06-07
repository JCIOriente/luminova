import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export type BadgeTone = "blue" | "teal" | "green" | "amber" | "red" | "gray" | "navy";

const TONE: Record<BadgeTone, string> = {
  blue: "bg-jci-blue/12 text-jci-blue",
  teal: "bg-jci-teal/20 text-teal-ink",
  green: "bg-ok/14 text-ok",
  amber: "bg-jci-yellow/22 text-warn",
  red: "bg-error/12 text-error",
  gray: "bg-ink-1/[0.05] text-ink-3",
  navy: "bg-jci-navy/12 text-jci-navy",
};

export function Badge({
  tone = "gray",
  dot = false,
  className,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill px-[11px] py-1 text-[11.5px] font-semibold tracking-[0.01em] whitespace-nowrap",
        TONE[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
