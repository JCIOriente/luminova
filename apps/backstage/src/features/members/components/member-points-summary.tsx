import { Sparkline } from "@luminova/ui";
import type { MemberPoints } from "@luminova/types/engine";

interface MemberPointsSummaryProps {
  points: MemberPoints | null | undefined;
  termId: string;
}

export function MemberPointsSummary({ points, termId }: MemberPointsSummaryProps) {
  const months = Object.entries(points?.byMonth ?? {}).sort(([a], [b]) => (a < b ? -1 : 1));
  return (
    <div className="flex flex-wrap items-end gap-8 rounded-[14px] border border-line bg-surface px-6 py-5">
      <div>
        <div className="text-[34px] leading-none font-semibold text-ink-1 tabular-nums">
          {points?.cumulative ?? 0}
        </div>
        <div className="mt-1.5 text-[12px] text-ink-3">puntos confirmados · {termId}</div>
      </div>
      {months.length >= 2 && <Sparkline values={months.map(([, value]) => value)} />}
      {months.length > 0 && (
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-ink-3">
          {months.map(([month, value]) => (
            <li key={month} className="tabular-nums">
              <span className="text-ink-2">{month}</span> · {value}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
