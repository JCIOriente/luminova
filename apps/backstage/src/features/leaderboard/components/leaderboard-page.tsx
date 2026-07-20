import { useMemo, useState } from "react";
import { SegmentedControl } from "@luminova/ui";
import { currentTermKey, type Member } from "@luminova/types";
import { PageHeader } from "../../../components/page-header";
import { useMembers } from "../../members/hooks/use-members";
import { useMemberPointsByTerm } from "../../members/hooks/use-member-points-by-term";
import { useTerm } from "../hooks/use-term";
import { rankAnnual, rankMonthly, monthsPresent } from "../leaderboard";
import { LeaderboardTable } from "./leaderboard-table";

export function LeaderboardPage() {
  const termId = currentTermKey();
  const prevId = String(Number(termId) - 1);

  const members = useMembers();
  const points = useMemberPointsByTerm(termId);
  const currentTerm = useTerm(termId);
  const previousTerm = useTerm(prevId);

  const [view, setView] = useState<"annual" | string>("annual");

  const queries = [members, points, currentTerm, previousTerm];
  const isPending = queries.some((q) => q.isPending);
  const isError = queries.some((q) => q.isError);

  const months = useMemo(() => monthsPresent(points.data ?? []), [points.data]);

  const entries = useMemo(() => {
    const membersById = new Map<string, Member>((members.data ?? []).map((m) => [m.id, m]));
    const ctx = {
      points: points.data ?? [],
      membersById,
      currentTerm: currentTerm.data ?? null,
      previousTerm: previousTerm.data ?? null,
    };
    return view === "annual" ? rankAnnual(ctx) : rankMonthly(ctx, view);
  }, [view, members.data, points.data, currentTerm.data, previousTerm.data]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Reconocimiento"
        title="Clasificación"
        subtitle={`Mejor Miembro Individual · gestión ${termId}`}
      />

      <SegmentedControl
        aria-label="Periodo"
        value={view}
        onChange={setView}
        options={[
          { value: "annual", label: "Anual" },
          ...months.map((month) => ({ value: month, label: month })),
        ]}
      />

      {isPending && <p className="text-ink-3">Cargando…</p>}
      {isError && <p className="text-error">No se pudo cargar la clasificación.</p>}
      {!isPending && !isError && <LeaderboardTable entries={entries} />}
    </div>
  );
}
