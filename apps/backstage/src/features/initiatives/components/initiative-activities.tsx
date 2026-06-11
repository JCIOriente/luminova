import type { Activity, ActivityStatus } from "@luminova/types";
import { Badge, type BadgeTone, EmptyState, Icon } from "@luminova/ui";
import { Link } from "@tanstack/react-router";
import { formatMonthYear } from "../lib/derive";

interface InitiativeActivitiesProps {
  activities: Activity[];
}

export function InitiativeActivities({ activities }: InitiativeActivitiesProps) {
  if (activities.length === 0) {
    return (
      <EmptyState
        title="Sin actividades"
        description="Las actividades de ejecucion apareceran aqui cuando se creen."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {activities.map((activity) => (
        <li key={activity.id}>
          <Link
            to="/activities"
            className="group flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 transition-[transform,box-shadow] duration-200 ease-expo hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-24px_rgba(19,15,45,0.35)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jci-blue motion-reduce:hover:translate-y-0"
          >
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="text-[14px] font-semibold text-ink-1">{activity.title}</span>
              <span className="flex items-center gap-1.5 text-[12px] text-ink-3">
                {Icon.calendar({ s: 14 })}
                {formatMonthYear(activity.startAt)}
              </span>
            </span>
            <Badge tone={ACTIVITY_STATUS_TONE[activity.status]}>
              {ACTIVITY_STATUS_LABEL[activity.status]}
            </Badge>
            <span className="text-ink-4 transition-colors group-hover:text-ink-2">
              {Icon.chevRight({ s: 16 })}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const ACTIVITY_STATUS_LABEL: Record<ActivityStatus, string> = {
  Programada: "Programada",
  Ejecutada: "Ejecutada",
  Cancelada: "Cancelada",
};

const ACTIVITY_STATUS_TONE: Record<ActivityStatus, BadgeTone> = {
  Programada: "blue",
  Ejecutada: "green",
  Cancelada: "gray",
};
