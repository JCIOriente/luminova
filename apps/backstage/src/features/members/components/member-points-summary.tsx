import { Sparkline } from "@luminova/ui";
import type { MemberPoints } from "@luminova/types/engine";

interface MemberPointsSummaryProps {
  points: MemberPoints | null | undefined;
  termId: string;
  rank: { rank: number; total: number } | null;
  activityCount: number;
}

function Stat({
  value,
  label,
  accent = false,
}: {
  value: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div
        className={`text-[40px] leading-none font-semibold tabular-nums ${
          accent ? "text-jci-yellow" : "text-on-dark-1"
        }`}
      >
        {value}
      </div>
      <div className="mt-2 text-[12px] leading-tight text-on-dark-3">{label}</div>
    </div>
  );
}

export function MemberPointsSummary({
  points,
  termId,
  rank,
  activityCount,
}: MemberPointsSummaryProps) {
  const months = Object.entries(points?.byMonth ?? {}).sort(([a], [b]) => (a < b ? -1 : 1));

  return (
    <div className="flex flex-col gap-6 rounded-[14px] bg-jci-blue px-7 py-6 text-on-dark-1">
      <div className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3">
        <Stat
          value={String(points?.cumulative ?? 0)}
          label={`puntos confirmados · ${termId}`}
          accent
        />
        {rank && <Stat value={`${rank.rank}°`} label={`de ${rank.total} en el capítulo`} />}
        <Stat value={String(activityCount)} label="actividades este período" />
      </div>

      {months.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-on-dark-3/25 pt-4">
          {months.length >= 2 && (
            <Sparkline values={months.map(([, value]) => value)} className="text-on-dark-2" />
          )}
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-on-dark-3">
            {months.map(([month, value]) => (
              <li key={month} className="tabular-nums">
                <span className="text-on-dark-2">{month}</span> · {value}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
