import {
  DataTable,
  Badge,
  EmptyState,
  Icon,
  type DataTableColumn,
  type BadgeTone,
} from "@luminova/ui";
import type { LeaderboardEntry } from "../leaderboard";

const MEDAL_TONE: Record<number, BadgeTone> = {
  1: "amber",
  2: "gray",
  3: "navy",
};

function RankBadge({ rank }: { rank: number }) {
  const tone = MEDAL_TONE[rank];
  if (!tone) return <span className="pl-2 tabular-nums text-ink-3">{rank}</span>;
  return (
    <Badge tone={tone} className="tabular-nums">
      {rank}
    </Badge>
  );
}

const columns: DataTableColumn<LeaderboardEntry>[] = [
  {
    id: "rank",
    header: "#",
    sortable: false,
    cell: (entry) => <RankBadge rank={entry.rank} />,
  },
  {
    id: "name",
    header: "Miembro",
    sortable: false,
    cell: (entry) => (
      <span className="flex items-center gap-2">
        <span className="font-semibold text-ink-1">{entry.name}</span>
        {entry.isBestOfMonth && <Badge tone="amber">Mejor del Mes</Badge>}
      </span>
    ),
  },
  {
    id: "points",
    header: "Puntos",
    sortable: false,
    cell: (entry) => <span className="tabular-nums text-ink-2">{entry.points}</span>,
  },
];

export function LeaderboardTable({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <DataTable
      rows={entries}
      columns={columns}
      getRowId={(entry) => entry.memberId}
      pageSize={16}
      paginationLabel="miembros"
      emptyState={
        <EmptyState
          icon={Icon.barChart({ s: 40 })}
          title="Aún no hay puntos en esta gestión"
          description="La clasificación aparecerá cuando los miembros acumulen puntos confirmados."
        />
      }
    />
  );
}
