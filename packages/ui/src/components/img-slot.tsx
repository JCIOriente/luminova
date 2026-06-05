import type { CSSProperties } from "react";
import { cn } from "../lib/cn";

interface ImgSlotProps {
  label: string;
  tint?: "blue" | "teal" | "navy";
  dark?: boolean;
  aspect?: string;
  height?: number | string;
  style?: CSSProperties;
  className?: string;
}

const STRIPES_LIGHT =
  "repeating-linear-gradient(135deg, rgba(19,15,45,0.04) 0 8px, rgba(19,15,45,0.07) 8px 16px)";
const STRIPES_DARK =
  "repeating-linear-gradient(135deg, rgba(255,255,255,0.04) 0 8px, rgba(255,255,255,0.08) 8px 16px)";
const TINT: Record<NonNullable<ImgSlotProps["tint"]>, string> = {
  blue: "linear-gradient(135deg, rgba(0,151,215,0.18) 0%, rgba(0,151,215,0.06) 100%)",
  teal: "linear-gradient(135deg, rgba(87,188,188,0.22) 0%, rgba(87,188,188,0.06) 100%)",
  navy: "linear-gradient(135deg, rgba(31,71,137,0.22) 0%, rgba(31,71,137,0.06) 100%)",
};

export function ImgSlot({
  label,
  tint,
  dark = false,
  aspect = "4/3",
  height,
  style = {},
  className,
}: ImgSlotProps) {
  const base = dark ? STRIPES_DARK : STRIPES_LIGHT;
  const background = tint ? `${TINT[tint]}, ${STRIPES_LIGHT}` : base;
  return (
    <div
      className={cn(
        "relative flex items-end overflow-hidden rounded-card border p-4",
        dark ? "border-white/10" : "border-line",
        className,
      )}
      style={{ background, aspectRatio: height ? undefined : aspect, height, ...style }}
      aria-label={label}
      role="img"
    >
      <div
        className={cn(
          "rounded-md border px-2 py-1 font-mono text-[11px] tracking-[0.02em]",
          dark
            ? "border-white/15 bg-white/[0.06] text-white/70"
            : "border-line bg-jci-white text-ink-2",
        )}
      >
        {label}
      </div>
    </div>
  );
}
