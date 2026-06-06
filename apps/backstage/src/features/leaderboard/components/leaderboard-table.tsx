import {
  Badge,
  EmptyState,
  Icon,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
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

export function LeaderboardTable({ entries }: { entries: LeaderboardEntry[] }) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={Icon.barChart({ s: 40 })}
        title="Aún no hay puntos en esta gestión"
        description="La clasificación aparecerá cuando los miembros acumulen puntos confirmados."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">#</TableHead>
          <TableHead>Miembro</TableHead>
          <TableHead>Puntos</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.memberId}>
            <TableCell>
              <RankBadge rank={entry.rank} />
            </TableCell>
            <TableCell>
              <span className="font-semibold text-ink-1">{entry.name}</span>
              {entry.isBestOfMonth && (
                <Badge tone="amber" className="ml-2">
                  Mejor del Mes
                </Badge>
              )}
            </TableCell>
            <TableCell className="tabular-nums">{entry.points}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
