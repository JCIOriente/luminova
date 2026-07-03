import { Card, Icon, ProgressBar } from "@luminova/ui";
import { formatMonthYear } from "../../../lib/datetime";
import type { Progress } from "../lib/derive";
import type { InitiativeListItem } from "../lib/initiative-list-item";

interface InitiativeSummaryProps {
  item: InitiativeListItem;
  progress: Progress;
}

export function InitiativeSummary({ item, progress }: InitiativeSummaryProps) {
  return (
    <div className="flex flex-col gap-4">
      <Card as="section" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-ink-1">Avance</h2>
          <span className="text-[20px] font-semibold tabular-nums text-ink-1">{progress.pct}%</span>
        </div>
        <ProgressBar value={progress.pct} label={`Avance ${progress.pct}%`} />
        <p className="text-[13px] text-ink-2">
          {progress.executed} de {progress.total}{" "}
          {progress.total === 1 ? "actividad ejecutada" : "actividades ejecutadas"},{" "}
          {progress.pending} {progress.pending === 1 ? "pendiente" : "pendientes"}
        </p>
      </Card>

      <Card as="section" className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold text-ink-1">Cronograma</h2>
        <ul className="flex flex-col gap-3">
          <li className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-jci-blue/12 text-jci-blue">
              {Icon.calendar({ s: 18 })}
            </span>
            <span className="flex flex-col">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-4">
                Inicio
              </span>
              <span className="text-[14px] font-medium text-ink-1">
                {formatMonthYear(item.startDate)}
              </span>
            </span>
          </li>
          <li className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-jci-teal/20 text-teal-ink">
              {Icon.target({ s: 18 })}
            </span>
            <span className="flex flex-col">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-4">
                Cierre estimado
              </span>
              <span className="text-[14px] font-medium text-ink-1">
                {formatMonthYear(item.endDate)}
              </span>
            </span>
          </li>
        </ul>
      </Card>
    </div>
  );
}
