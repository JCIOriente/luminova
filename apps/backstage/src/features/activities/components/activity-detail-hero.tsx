import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { Activity } from "@luminova/types";
import { Badge, Card, Icon, RippleSVG } from "@luminova/ui";
import { CATEGORY_LABELS } from "../category-labels";
import { ACTIVITY_STATUS_TONE } from "../lib/status-tone";
import { CATEGORY_TONE, TONE_COVER_BG, TONE_RIPPLE_COLOR } from "../lib/category-tone";
import { locationKind } from "../lib/location-kind";
import { formatDateTime } from "../../../lib/datetime";
import { INITIATIVE_TYPE } from "../../initiatives/hooks/use-initiative";

interface ActivityDetailHeroProps {
  activity: Activity;
  parentTitle: string | null;
  actions?: ReactNode;
}

export function ActivityDetailHero({ activity, parentTitle, actions }: ActivityDetailHeroProps) {
  const tone = CATEGORY_TONE[activity.category];
  const cover = activity.photos[0]?.url ?? null;
  const dateRange =
    activity.endAt === null
      ? formatDateTime(activity.startAt)
      : `${formatDateTime(activity.startAt)} — ${formatDateTime(activity.endAt)}`;

  return (
    <Card as="header" padding="none" className="overflow-hidden">
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
            <span className="flex items-center gap-1.5 font-mono text-[10.5px] tracking-[0.12em] text-ink-3 uppercase">
              <span
                className="inline-block size-1.5 rounded-full"
                style={{ background: TONE_RIPPLE_COLOR[tone] }}
                aria-hidden="true"
              />
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
      </div>
    </Card>
  );
}
