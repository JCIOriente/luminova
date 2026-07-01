import { Icon } from "@luminova/ui";
import type { Attendance } from "../lib/attendance";

export function CheckInStats({ attendance }: { attendance: Attendance }) {
  const { present, capacity, pct, remaining } = attendance;

  return (
    <div className="flex flex-col items-center gap-5 rounded-card border border-line bg-surface px-5 py-5 sm:flex-row">
      <div
        className="relative grid size-28 shrink-0 place-items-center rounded-full"
        style={{
          background: `conic-gradient(var(--color-jci-blue) ${pct * 3.6}deg, var(--color-line) 0deg)`,
        }}
      >
        <div className="grid size-[5.75rem] place-items-center rounded-full bg-surface text-center">
          <span className="text-[26px] leading-none font-semibold tabular-nums text-ink-1">
            {present}
          </span>
          <span className="mt-1 text-[11px] text-ink-3">presentes</span>
        </div>
      </div>

      <div className="flex w-full flex-1 flex-col gap-3">
        <p className="flex flex-wrap items-baseline gap-x-2 text-[15px] text-ink-2">
          <strong className="text-[22px] font-semibold tabular-nums text-ink-1">{pct}%</strong>
          de asistencia
          <span className="text-ink-4" aria-hidden="true">
            ·
          </span>
          <span className="text-[13px] text-ink-3 tabular-nums">
            {present} de {capacity} esperados
          </span>
        </p>

        <div
          className="h-2 w-full overflow-hidden rounded-pill bg-line"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-pill bg-jci-blue transition-[width]"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-jci-blue/10 px-3 py-1.5 text-[12px] font-medium text-jci-blue">
            {Icon.check({ s: 15 })}
            {present} registrados
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-ink-1/[0.04] px-3 py-1.5 text-[12px] font-medium text-ink-3">
            {Icon.clock({ s: 15 })}
            {remaining} por llegar
          </span>
        </div>
      </div>
    </div>
  );
}
