import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { cardSurfaceClasses } from "./card";
import { Icon } from "./icons";
import { Sparkline } from "./sparkline-chart";

export type KpiTone = "blue" | "teal" | "navy" | "amber";

const TONE: Record<KpiTone, { tile: string; spark: string }> = {
  blue: { tile: "bg-jci-blue/10 text-jci-blue", spark: "text-jci-blue" },
  teal: { tile: "bg-jci-teal/16 text-teal-ink", spark: "text-teal-ink" },
  navy: { tile: "bg-jci-navy/12 text-jci-navy", spark: "text-jci-navy" },
  amber: { tile: "bg-jci-yellow/18 text-warn", spark: "text-warn" },
};

export interface KpiTrend {
  dir: "up" | "down" | "flat";
  label: string;
}

export function KpiCard({
  icon,
  tone = "blue",
  label,
  value,
  trend,
  spark,
}: {
  icon: ReactNode;
  tone?: KpiTone;
  label: string;
  value: ReactNode;
  trend?: KpiTrend;
  spark?: readonly number[];
}) {
  return (
    <div
      className={cn(
        cardSurfaceClasses,
        "flex flex-col gap-3.5 p-[18px] transition-[transform,box-shadow,border-color] duration-200 ease-expo hover:-translate-y-[3px] hover:border-line-strong hover:shadow-[0_22px_48px_-26px_rgba(19,15,45,0.28)]",
      )}
    >
      <div className="flex items-center gap-[11px]">
        <span
          className={cn(
            "flex size-[38px] shrink-0 items-center justify-center rounded-[11px]",
            TONE[tone].tile,
          )}
        >
          {icon}
        </span>
        <span className="text-[13px] font-medium leading-tight text-ink-3">{label}</span>
      </div>
      <div className="flex items-end justify-between gap-2.5">
        <span className="text-[34px] font-normal leading-none tracking-[-0.03em] text-ink-1 tabular-nums">
          {value}
        </span>
        {spark && <Sparkline values={spark} className={TONE[tone].spark} />}
      </div>
      {trend && (
        <span
          className={cn(
            "inline-flex items-center gap-1 text-[12.5px] font-semibold",
            trend.dir === "up" && "text-ok",
            trend.dir === "down" && "text-error",
            trend.dir === "flat" && "text-ink-3",
          )}
        >
          {trend.dir === "up" && Icon.trendUp({ s: 14 })}
          {trend.dir === "down" && Icon.trendDown({ s: 14 })}
          {trend.label}
        </span>
      )}
    </div>
  );
}
