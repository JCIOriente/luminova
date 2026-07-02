import { useId, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { areaPath, seriesPath, sharedDomain, type ChartSeries } from "./line-chart";

const W = 720;
const H = 300;

export function LineChart({
  series,
  height = 300,
  className,
}: {
  series: readonly ChartSeries[];
  height?: number;
  className?: string;
}) {
  const gradId = useId();
  const [hover, setHover] = useState<number | null>(null);

  // Path geometry depends only on the data, not on hover — memoize so pointer
  // moves (which only update `hover`) don't rebuild every path string per frame.
  const plot = useMemo(() => {
    if (series.length === 0) return null;
    const { min, max } = sharedDomain(series);
    const primary = series[0]!;
    return {
      primary,
      n: primary.values.length,
      area: areaPath(primary.values, W, H, min, max),
      lines: series.map((s) => ({
        label: s.label,
        color: s.color,
        d: seriesPath(s.values, W, H, min, max),
      })),
    };
  }, [series]);

  if (!plot) return null;
  const { primary, n } = plot;

  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(n - 1, Math.round(ratio * (n - 1)))));
  };

  const hx = hover === null || n <= 1 ? 0 : (W * hover) / (n - 1);

  return (
    <div className={className} style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`Gráfico de ${series.map((s) => s.label).join(" y ")}`}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            {/* stop-color via style: var(--*) colors don't work in SVG attributes */}
            <stop offset="0%" style={{ stopColor: primary.color }} stopOpacity="0.18" />
            <stop offset="100%" style={{ stopColor: primary.color }} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={plot.area} fill={`url(#${gradId})`} />
        {plot.lines.map((s) => (
          <path
            key={s.label}
            d={s.d}
            fill="none"
            style={{ stroke: s.color }}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {hover !== null && (
          <line
            x1={hx}
            y1="0"
            x2={hx}
            y2={H}
            stroke="currentColor"
            strokeOpacity="0.18"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-[10px] bg-jci-black px-3 py-2 text-[12px] text-white shadow-[0_12px_32px_-12px_rgba(19,15,45,0.5)]"
          style={{ left: `${(hover / Math.max(1, n - 1)) * 100}%`, top: 0 }}
        >
          {series.map((s) => (
            <div key={s.label} className="flex items-center gap-2 whitespace-nowrap">
              <span className="size-2 rounded-full" style={{ background: s.color }} />
              <span className="text-white/70">{s.label}</span>
              <span className="ml-auto font-bold tabular-nums">{s.values[hover]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
