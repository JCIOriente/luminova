import type { Activity } from "@luminova/types";
import { Card, Icon } from "@luminova/ui";
import { formatDateChip, formatTime } from "@luminova/utils/datetime";
import { upcomingActivities } from "../../activities/lib/activity-filter";
import { EventDateChip } from "../../../components/event-date-chip";
import { WidgetHeader } from "../../../components/widget-header";
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
  const upcoming = activities ? upcomingActivities(activities, now, limit) : [];

  return (
    <Card as="section" padding="none" className="flex flex-col">
      <WidgetHeader
        title="Próximos eventos"
        subtitle="Lo que viene en la gestión"
        icon={Icon.calendar({ s: 20 })}
      />

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
                <li key={a.id} className="flex items-center gap-4 rounded-card px-3 py-3">
                  <EventDateChip month={chip.month} day={chip.day} />
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
