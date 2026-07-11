import type { Activity } from "@luminova/types";
import { Card, Icon } from "@luminova/ui";
import { formatDateChip, formatTime } from "@luminova/utils/datetime";
import { filterActivities } from "../../activities/lib/activity-filter";
import { QueryErrorState } from "../../../components/query-error-state";

export function MemberUpcomingEvents({
  activities,
  isLoading,
  isError,
  error,
  onRetry,
  now,
  limit = 5,
}: {
  activities: Activity[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  now: Date;
  limit?: number;
}) {
  const upcoming = activities
    ? filterActivities(activities, "proximos", now)
        .sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis())
        .slice(0, limit)
    : [];

  return (
    <Card as="section" padding="none" className="flex flex-col">
      <header className="flex items-center justify-between border-b border-line px-6 py-4">
        <div>
          <h2 className="text-ui-lg font-semibold text-ink-1">Próximos eventos</h2>
          <div className="mt-0.5 text-ui-xs text-ink-3">Lo que viene en la gestión</div>
        </div>
        <span className="text-ink-3">{Icon.calendar({ s: 20 })}</span>
      </header>

      <div className="flex-1 px-3 py-3">
        {isError ? (
          <QueryErrorState error={error} onRetry={onRetry} />
        ) : isLoading ? (
          <p className="px-3 py-8 text-center text-ui-xs text-ink-3">Cargando…</p>
        ) : upcoming.length === 0 ? (
          <p className="px-3 py-8 text-center text-ui-xs text-ink-3">No hay eventos próximos.</p>
        ) : (
          <ul className="flex flex-col">
            {upcoming.map((a) => {
              const chip = formatDateChip(a.startAt);
              return (
                <li key={a.id} className="flex items-center gap-4 rounded-[12px] px-3 py-3">
                  <div className="flex size-[48px] shrink-0 flex-col items-center justify-center rounded-[11px] border border-line bg-surface-2">
                    <span className="text-ui-2xs font-bold tracking-[0.1em] text-jci-blue uppercase">
                      {chip.month}
                    </span>
                    <span className="text-ui-lg font-medium leading-none text-ink-1">
                      {chip.day}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-ui-sm font-semibold text-ink-1">{a.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-ui-xs text-ink-3">
                      <span>{formatTime(a.startAt)}</span>
                      <span className="size-[3px] rounded-full bg-ink-3" />
                      <span className="truncate">{a.location ?? "Sin ubicación"}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
