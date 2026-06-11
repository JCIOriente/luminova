import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { Activity, Member } from "@luminova/types";
import { Avatar, AvatarStack, Badge, Icon } from "@luminova/ui";
import { CATEGORY_LABELS } from "../category-labels";
import { ACTIVITY_STATUS_TONE } from "../lib/status-tone";
import { formatActivityDateTime } from "../lib/format";
import { INITIATIVE_TYPE } from "../../initiatives/hooks/use-initiative";

interface ActivityDetailHeroProps {
  activity: Activity;
  director: Member | null;
  coDirectors: Member[];
  parentTitle: string | null;
  actions?: ReactNode;
}

export function ActivityDetailHero({
  activity,
  director,
  coDirectors,
  parentTitle,
  actions,
}: ActivityDetailHeroProps) {
  const cover = activity.photos[0]?.url ?? null;
  const dateRange =
    activity.endAt === null
      ? formatActivityDateTime(activity.startAt)
      : `${formatActivityDateTime(activity.startAt)} — ${formatActivityDateTime(activity.endAt)}`;
  const coDirectorPeople = coDirectors.map((m) => ({ name: m.name, src: m.profilePicture }));

  return (
    <header className="flex flex-col gap-4 overflow-hidden rounded-card border border-line bg-surface">
      {cover ? (
        <img src={cover} alt="" className="h-44 w-full object-cover" />
      ) : (
        <span className="h-1 w-full bg-jci-blue" aria-hidden />
      )}

      <div className="flex flex-col gap-3 px-5 pb-5">
        <div className="flex items-start gap-3">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <Badge tone="gray" dot>
              {CATEGORY_LABELS[activity.category]}
            </Badge>
            <Badge tone={ACTIVITY_STATUS_TONE[activity.status]}>{activity.status}</Badge>
            {activity.parentType && activity.parentId && (
              <Link
                to="/initiatives/$type/$id"
                params={{ type: INITIATIVE_TYPE[activity.parentType], id: activity.parentId }}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-jci-blue hover:underline"
              >
                {Icon.briefcase({ s: 14 })}
                {parentTitle ?? "Ver proyecto"}
              </Link>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>

        <div>
          <h1 className="text-[24px] font-semibold leading-tight text-ink-1">{activity.title}</h1>
          <p className="mt-2 flex items-center gap-1.5 text-[13px] text-ink-3 tabular-nums">
            {Icon.calendar({ s: 14 })}
            {dateRange}
          </p>
        </div>

        {(director || coDirectorPeople.length > 0) && (
          <div className="flex items-center gap-4">
            {director && (
              <span className="flex items-center gap-2">
                <Avatar src={director.profilePicture} name={director.name} size={32} />
                <span className="flex flex-col">
                  <span className="text-[11px] uppercase tracking-wide text-ink-4">Director</span>
                  <span className="text-[13px] font-medium text-ink-1">{director.name}</span>
                </span>
              </span>
            )}
            {coDirectorPeople.length > 0 && (
              <span className="flex items-center gap-2">
                <AvatarStack people={coDirectorPeople} max={3} />
                <span className="text-[12px] text-ink-3">
                  {coDirectorPeople.length === 1 ? "Codirector" : "Codirectores"}
                </span>
              </span>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
