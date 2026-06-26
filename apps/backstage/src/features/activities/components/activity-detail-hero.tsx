import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { Activity, Member } from "@luminova/types";
import { Avatar, AvatarStack, Badge, Icon, RippleSVG } from "@luminova/ui";
import { CATEGORY_LABELS } from "../category-labels";
import { ACTIVITY_STATUS_TONE } from "../lib/status-tone";
import { CATEGORY_TONE, TONE_COVER_BG, TONE_RIPPLE_COLOR } from "../lib/category-tone";
import { locationKind } from "../lib/location-kind";
import { formatDateTime } from "../../../lib/datetime";
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
  const tone = CATEGORY_TONE[activity.category];
  const cover = activity.photos[0]?.url ?? null;
  const dateRange =
    activity.endAt === null
      ? formatDateTime(activity.startAt)
      : `${formatDateTime(activity.startAt)} — ${formatDateTime(activity.endAt)}`;
  const coDirectorPeople = coDirectors.map((m) => ({ name: m.name, src: m.profilePicture }));

  return (
    <header className="overflow-hidden rounded-card border border-line bg-surface">
      <div className={`relative h-40 ${TONE_COVER_BG[tone]}`}>
        {cover ? (
          <img src={cover} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <div className="pointer-events-none absolute -right-8 -bottom-14 opacity-50">
            <RippleSVG
              rings={6}
              stroke={5}
              size={240}
              color={TONE_RIPPLE_COLOR[tone]}
              className="motion-safe:animate-spin [animation-duration:60s]"
            />
          </div>
        )}
        <div className="absolute bottom-3 left-3">
          <Badge tone={ACTIVITY_STATUS_TONE[activity.status]} dot={activity.status === "Ejecutada"}>
            {activity.status}
          </Badge>
        </div>
      </div>

      <div className="flex flex-col gap-3 px-5 pt-4 pb-5">
        <div className="flex items-start gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <span className="font-mono text-[10.5px] tracking-[0.12em] text-ink-3 uppercase">
              {CATEGORY_LABELS[activity.category]}
            </span>
            <h1 className="text-[24px] leading-tight font-semibold text-ink-1">{activity.title}</h1>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-ink-2">
          <span className="flex items-center gap-1.5 tabular-nums">
            {Icon.calendar({ s: 15 })}
            {dateRange}
          </span>
          {activity.location && (
            <span className="flex items-center gap-1.5">
              {locationKind(activity.location) === "virtual"
                ? Icon.globe({ s: 15 })
                : Icon.pin({ s: 15 })}
              {activity.location}
            </span>
          )}
          {activity.parentType && activity.parentId && (
            <Link
              to="/initiatives/$type/$id"
              params={{ type: INITIATIVE_TYPE[activity.parentType], id: activity.parentId }}
              className="flex items-center gap-1.5 font-medium text-jci-blue hover:underline"
            >
              {Icon.briefcase({ s: 15 })}
              {parentTitle ?? "Ver iniciativa"}
            </Link>
          )}
        </div>

        {(director || coDirectorPeople.length > 0) && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line pt-3">
            {director && (
              <span className="flex items-center gap-2">
                <Avatar src={director.profilePicture} name={director.name} size={32} />
                <span className="flex flex-col">
                  <span className="text-[11px] tracking-wide text-ink-4 uppercase">Director</span>
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
