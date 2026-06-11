import type { Member } from "@luminova/types";
import { AvatarStack, Badge, Icon, ProgressBar } from "@luminova/ui";
import { AREA_OF_OPPORTUNITY_LABELS } from "@luminova/types";
import {
  areaTone,
  formatMonthYear,
  statusLabel,
  statusTone,
} from "../features/initiatives/lib/derive";
import type { InitiativeListItem } from "../features/initiatives/lib/initiative-list-item";

interface InitiativeCardProps {
  item: InitiativeListItem;
  pct: number;
  closingSoon: boolean;
  memberById: Map<string, Member>;
  onOpen?: () => void;
}

export function InitiativeCard({
  item,
  pct,
  closingSoon,
  memberById,
  onOpen,
}: InitiativeCardProps) {
  const cover = item.photos[0]?.url ?? null;
  const rosterIds = [item.roster.directorId, ...item.roster.coDirectorIds, ...item.roster.teamIds];
  const people = rosterIds
    .map((id) => memberById.get(id))
    .filter((m): m is Member => Boolean(m))
    .map((m) => ({ name: m.name, src: m.profilePicture }));

  const interactive = Boolean(onOpen);
  const Tag = interactive ? "button" : "div";

  return (
    <Tag
      {...(interactive ? { type: "button" as const, onClick: onOpen } : {})}
      className={`group relative flex flex-col overflow-hidden rounded-card border border-line bg-surface text-left transition-[transform,box-shadow] duration-200 ease-expo ${
        interactive
          ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-24px_rgba(19,15,45,0.35)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jci-blue motion-reduce:hover:translate-y-0"
          : ""
      }`}
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
          <span className="ml-auto text-[11px] font-semibold uppercase tracking-wide text-ink-4">
            {item.kind === "Program" ? "Programa" : "Proyecto"}
          </span>
        </div>

        <div>
          <h3 className="text-[15px] font-semibold leading-snug text-ink-1">{item.title}</h3>
          <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-ink-2">
            {item.description}
          </p>
        </div>

        <div className="mt-auto flex flex-col gap-3 pt-1">
          <div className="flex items-center gap-2">
            <ProgressBar value={pct} label={`Avance ${pct}%`} className="flex-1" />
            <span className="text-[12px] font-semibold tabular-nums text-ink-2">{pct}%</span>
          </div>
          <div className="flex items-center justify-between">
            <AvatarStack people={people} max={3} />
            <span className="flex items-center gap-1.5 text-[12px] font-medium text-ink-3">
              {Icon.calendar({ s: 14 })}
              {formatMonthYear(item.endDate)}
            </span>
          </div>
        </div>
      </div>
    </Tag>
  );
}

const COVER_STRIP: Record<ReturnType<typeof areaTone>, string> = {
  blue: "bg-jci-blue",
  teal: "bg-jci-teal",
  amber: "bg-jci-yellow",
  navy: "bg-jci-navy",
  green: "bg-ok",
  red: "bg-error",
  gray: "bg-ink-4",
};
