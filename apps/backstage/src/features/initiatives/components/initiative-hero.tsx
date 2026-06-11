import { AREA_OF_OPPORTUNITY_LABELS } from "@luminova/types";
import { Badge } from "@luminova/ui";
import type { ReactNode } from "react";
import {
  COVER_STRIP,
  areaTone,
  formatMonthYear,
  statusLabel,
  statusTone,
} from "../lib/derive";
import type { InitiativeListItem } from "../lib/initiative-list-item";

interface InitiativeHeroProps {
  item: InitiativeListItem;
  closingSoon: boolean;
  actions?: ReactNode;
}

export function InitiativeHero({ item, closingSoon, actions }: InitiativeHeroProps) {
  const cover = item.photos[0]?.url ?? null;
  const closedAt = item.finalReport ? formatMonthYear(item.finalReport.filedAt) : null;

  return (
    <header className="flex flex-col gap-4 overflow-hidden rounded-card border border-line bg-surface">
      {cover ? (
        <img src={cover} alt="" className="h-44 w-full object-cover" />
      ) : (
        <span className={`h-1 w-full ${COVER_STRIP[areaTone(item.category)]}`} aria-hidden />
      )}

      <div className="flex flex-col gap-3 px-5 pb-5">
        <div className="flex items-start gap-3">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <Badge tone={areaTone(item.category)} dot>
              {AREA_OF_OPPORTUNITY_LABELS[item.category]}
            </Badge>
            <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
            {closingSoon && (
              <Badge tone="amber" dot>
                Por cerrar
              </Badge>
            )}
            {closedAt && (
              <span className="text-[12px] font-medium text-ink-3">Cerrado en {closedAt}</span>
            )}
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-4">
              {item.kind === "Program" ? "Programa" : "Proyecto"}
            </span>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>

        <div>
          <h1 className="text-[24px] font-semibold leading-tight text-ink-1">{item.title}</h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-2">
            {item.description}
          </p>
        </div>
      </div>
    </header>
  );
}
