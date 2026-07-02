import { Link } from "@tanstack/react-router";
import { Avatar, Badge, Icon, Menu, MenuItem, MenuSeparator, RippleSVG } from "@luminova/ui";
import type { Activity } from "@luminova/types";
import { CATEGORY_LABELS } from "../category-labels";
import { ACTIVITY_STATUS_TONE } from "../lib/status-tone";
import { CATEGORY_TONE, TONE_COVER_BG, TONE_RIPPLE_COLOR } from "../lib/category-tone";
import { formatDateChip, formatDateTime } from "../../../lib/datetime";
import { locationKind } from "../lib/location-kind";

export interface CardDirector {
  name: string;
  profilePicture: string | null;
}

interface ActivityCardProps {
  activity: Activity;
  parentTitle: string | null;
  checkInOpen: boolean;
  director: CardDirector | null;
  canManage: boolean;
  onEdit: (activity: Activity) => void;
  onCancel: (activity: Activity) => void;
}

export function ActivityCard({
  activity,
  parentTitle,
  checkInOpen,
  director,
  canManage,
  onEdit,
  onCancel,
}: ActivityCardProps) {
  const tone = CATEGORY_TONE[activity.category];
  const chip = formatDateChip(activity.startAt);
  const showCheckInClosed = !checkInOpen && activity.status !== "Cancelada";

  return (
    <article className="flex flex-col overflow-hidden rounded-card border border-line bg-surface">
      <div className={`relative h-28 ${TONE_COVER_BG[tone]}`}>
        <div className="pointer-events-none absolute -right-6 -bottom-10 opacity-50">
          <RippleSVG
            rings={5}
            stroke={5}
            size={150}
            color={TONE_RIPPLE_COLOR[tone]}
            className="motion-safe:animate-spin [animation-duration:60s]"
          />
        </div>
        <div className="absolute top-3 left-3 flex flex-col items-center rounded-card bg-surface px-3 py-1.5 shadow-[0_8px_24px_-12px_rgba(19,15,45,0.45)]">
          <span className="font-mono text-[10px] tracking-[0.12em] text-ink-3 uppercase">
            {chip.month}
          </span>
          <span className="text-[18px] leading-none font-semibold tabular-nums text-ink-1">
            {chip.day}
          </span>
        </div>
        <div className="absolute bottom-3 left-3">
          <Badge tone={ACTIVITY_STATUS_TONE[activity.status]} dot={activity.status === "Ejecutada"}>
            {activity.status}
          </Badge>
        </div>
        {/* A Cancelada activity has no manageable action (edit hidden to match the
            detail page; cancel is impossible) — don't render an empty actions menu. */}
        {canManage && activity.status !== "Cancelada" && (
          <div className="absolute top-3 right-3">
            <Menu
              align="end"
              trigger={
                <button
                  type="button"
                  aria-label={`Acciones para ${activity.title}`}
                  className="grid size-8 place-items-center rounded-[8px] bg-surface/90 text-ink-2 shadow-[0_8px_24px_-12px_rgba(19,15,45,0.45)] transition-colors hover:text-ink-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jci-blue"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="5" r="1.6" />
                    <circle cx="12" cy="12" r="1.6" />
                    <circle cx="12" cy="19" r="1.6" />
                  </svg>
                </button>
              }
            >
              <MenuItem onSelect={() => onEdit(activity)}>Editar</MenuItem>
              <MenuSeparator />
              <MenuItem danger onSelect={() => onCancel(activity)}>
                Cancelar actividad
              </MenuItem>
            </Menu>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-5">
        <div className="font-mono text-[10.5px] tracking-[0.12em] text-ink-3 uppercase">
          {CATEGORY_LABELS[activity.category]}
        </div>
        <Link
          to="/activities/$id"
          params={{ id: activity.id }}
          className="text-[15px] leading-snug font-semibold text-ink-1 underline-offset-4 hover:text-jci-blue hover:underline"
        >
          {activity.title}
        </Link>
        {(parentTitle || showCheckInClosed) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {parentTitle && <Badge tone="blue">{parentTitle}</Badge>}
            {showCheckInClosed && <Badge tone="gray">Check-in cerrado</Badge>}
          </div>
        )}

        <div className="mt-1 flex flex-col gap-1.5 text-[13px] text-ink-2">
          <div className="flex items-center gap-2">
            {Icon.calendar({ s: 15 })}
            <span className="tabular-nums">{formatDateTime(activity.startAt)}</span>
          </div>
          {activity.location && (
            <div className="flex items-center gap-2">
              {locationKind(activity.location) === "virtual"
                ? Icon.globe({ s: 15 })
                : Icon.pin({ s: 15 })}
              <span className="truncate">{activity.location}</span>
            </div>
          )}
        </div>

        {director && (
          <div className="mt-auto flex items-center gap-2.5 border-t border-line pt-3">
            <Avatar src={director.profilePicture} name={director.name} size={28} />
            <div className="text-[12.5px] text-ink-3">
              Responsable · <span className="font-semibold text-ink-1">{director.name}</span>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
