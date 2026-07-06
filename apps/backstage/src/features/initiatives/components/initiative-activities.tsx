import type { Activity } from "@luminova/types";
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  cardInteractiveClasses,
  cardSurfaceClasses,
  cn,
} from "@luminova/ui";
import { Link } from "@tanstack/react-router";
import { ACTIVITY_STATUS_TONE } from "../../activities/lib/status-tone";
import { formatMonthYear } from "@luminova/utils/datetime";

const activityRowClasses = cn(
  cardSurfaceClasses,
  cardInteractiveClasses,
  "group flex items-center gap-3 px-4 py-3",
);

interface InitiativeActivitiesProps {
  activities: Activity[];
  canCreate: boolean;
  onCreate: () => void;
}

export function InitiativeActivities({
  activities,
  canCreate,
  onCreate,
}: InitiativeActivitiesProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-ui-lg font-semibold text-ink-1">Actividades</h2>
        {canCreate && (
          <Button
            as="button"
            type="button"
            variant="secondary"
            iconLeft={Icon.plus({ s: 16 })}
            onClick={onCreate}
          >
            Nueva actividad
          </Button>
        )}
      </div>

      {activities.length === 0 ? (
        <EmptyState
          title="Sin actividades"
          description="Las actividades de ejecución aparecerán aquí cuando se creen."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {activities.map((activity) => (
            <li key={activity.id}>
              <Link
                to="/activities/$id"
                params={{ id: activity.id }}
                className={activityRowClasses}
              >
                <span className="flex flex-1 flex-col gap-0.5">
                  <span className="text-ui-md font-semibold text-ink-1">{activity.title}</span>
                  <span className="flex items-center gap-1.5 text-ui-xs text-ink-3">
                    {Icon.calendar({ s: 14 })}
                    {formatMonthYear(activity.startAt)}
                  </span>
                </span>
                <Badge tone={ACTIVITY_STATUS_TONE[activity.status]}>{activity.status}</Badge>
                <span className="text-ink-4 transition-colors group-hover:text-ink-2">
                  {Icon.chevRight({ s: 16 })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
