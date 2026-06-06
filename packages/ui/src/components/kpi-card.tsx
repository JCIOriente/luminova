import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { Icon } from "./icons";
import { Sparkline } from "./sparkline-chart";

export type KpiTone = "blue" | "teal" | "navy" | "amber";

const TILE: Record<KpiTone, string> = {
  blue: "bg-jci-blue/10 text-jci-blue",
  teal: "bg-jci-teal/16 text-teal-ink",
  navy: "bg-jci-navy/12 text-jci-navy",
  amber: "bg-jci-yellow/18 text-warn",
};

const SPARK: Record<KpiTone, string> = {
  blue: "text-jci-blue",
  teal: "text-teal-ink",
  navy: "text-jci-navy",
  amber: "text-warn",
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
  spark?: number[];
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-line bg-surface p-[18px] shadow-[0_1px_2px_rgba(19,15,45,0.05)] transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_18px_40px_-24px_rgba(19,15,45,0.22)]">
      <div className="flex items-center gap-2.5">
        <span className={cn("flex size-[38px] shrink-0 items-center justify-center rounded-[11px]", TILE[tone])}>
          {icon}
        </span>
        <span className="text-[13px] font-medium leading-tight text-ink-3">{label}</span>
      </div>
      <div className="flex items-end justify-between gap-2.5">
        <span className="text-[34px] font-normal leading-none tracking-[-0.03em] text-ink-1 tabular-nums">{value}</span>
        {spark && <Sparkline values={spark} className={SPARK[tone]} />}
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
