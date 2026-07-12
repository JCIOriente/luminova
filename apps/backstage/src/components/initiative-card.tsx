import type { Member } from "@luminova/types";
import {
  AvatarStack,
  Badge,
  Icon,
  ProgressBar,
  cardInteractiveClasses,
  cardSurfaceClasses,
  cn,
} from "@luminova/ui";
import { AREA_OF_OPPORTUNITY_LABELS } from "@luminova/types";
import { COVER_STRIP, areaTone, statusLabel, statusTone } from "../features/initiatives/lib/derive";
import { formatMonthYear } from "@luminova/utils/datetime";
import type { InitiativeListItem } from "../features/initiatives/lib/initiative-list-item";

interface InitiativeCardProps {
  item: InitiativeListItem;
  pct: number;
  closingSoon: boolean;
  memberById: Map<string, Member>;
  onOpen?: () => void;
  /** Admin/ProjectManager only (mirrors rules' featuredUpdateSafe) — shows the star quick-toggle. */
  canFeature?: boolean;
  onToggleFeatured?: (next: boolean) => void;
}

const shellClasses = cn(
  cardSurfaceClasses,
  "group relative flex flex-col overflow-hidden text-left",
);
const interactiveShellClasses = cn(shellClasses, cardInteractiveClasses, "cursor-pointer");

export function InitiativeCard({
  item,
  pct,
  closingSoon,
  memberById,
  onOpen,
  canFeature = false,
  onToggleFeatured,
}: InitiativeCardProps) {
  const cover = item.photos[0]?.url ?? null;
  const rosterIds = [item.roster.directorId, ...item.roster.coDirectorIds, ...item.roster.teamIds];
  const people = rosterIds
    .map((id) => memberById.get(id))
    .filter((m): m is Member => Boolean(m))
    .map((m) => ({ name: m.name, src: m.profilePicture }));

  const interactive = Boolean(onOpen);
  const Tag = interactive ? "button" : "div";
  const showFeatureToggle = canFeature && Boolean(onToggleFeatured);

  const card = (
    <Tag
      {...(interactive ? { type: "button" as const, onClick: onOpen } : {})}
      className={interactive ? interactiveShellClasses : shellClasses}
    >
      {cover ? (
        <img src={cover} alt="" className="h-28 w-full object-cover" />
      ) : (
        <span className={`h-1 w-full ${COVER_STRIP[areaTone(item.category)]}`} aria-hidden />
      )}

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={areaTone(item.category)} dot>
            {AREA_OF_OPPORTUNITY_LABELS[item.category]}
          </Badge>
          <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
          {closingSoon && (
            <Badge tone="amber" dot>
              Por cerrar
            </Badge>
          )}
          <span className="ml-auto text-ui-2xs font-semibold uppercase tracking-wide text-ink-4">
            {item.kind === "Program" ? "Programa" : "Proyecto"}
          </span>
        </div>

        <div>
          <h3 className="text-ui-lg font-semibold leading-snug text-ink-1">{item.title}</h3>
          <p className="mt-1 line-clamp-2 text-ui-sm leading-relaxed text-ink-2">
            {item.description}
          </p>
        </div>

        <div className="mt-auto flex flex-col gap-3 pt-1">
          <div className="flex items-center gap-2">
            <ProgressBar value={pct} label={`Avance ${pct}%`} className="flex-1" />
            <span className="text-ui-xs font-semibold tabular-nums text-ink-2">{pct}%</span>
          </div>
          <div className="flex items-center justify-between">
            <AvatarStack people={people} max={3} />
            <span className="flex items-center gap-1.5 text-ui-xs font-medium text-ink-3">
              {Icon.calendar({ s: 14 })}
              {formatMonthYear(item.endDate)}
            </span>
          </div>
        </div>
      </div>
    </Tag>
  );

  if (!showFeatureToggle) return card;

  return (
    <div className="relative">
      {card}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleFeatured?.(!item.featured);
        }}
        aria-pressed={item.featured}
        title={item.featured ? "Quitar de destacados" : "Destacar en programas"}
        className={cn(
          "absolute right-2 top-2 z-10 flex size-8 items-center justify-center rounded-pill shadow-[0_8px_24px_-12px_rgba(19,15,45,0.55)] transition-colors",
          item.featured
            ? "bg-jci-blue text-white hover:bg-jci-blue/90"
            : "bg-surface/90 text-ink-3 backdrop-blur hover:text-jci-blue",
        )}
      >
        <span className="sr-only">
          {item.featured ? "Quitar de destacados" : "Destacar en programas"}
        </span>
        {Icon.spark({ s: 16 })}
      </button>
    </div>
  );
}
