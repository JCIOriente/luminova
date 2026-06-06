import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { cn } from "@luminova/ui";
import type { Member } from "@luminova/types";
import { PageHeader } from "../components/page-header";
import { currentTermId } from "../lib/current-term";
import { useMembers } from "../features/members/hooks/use-members";
import { useMemberPointsByTerm } from "../features/members/hooks/use-member-points-by-term";
import { useTerm } from "../features/leaderboard/hooks/use-term";
import { rankAnnual, rankMonthly, monthsPresent } from "../features/leaderboard/leaderboard";
import { LeaderboardTable } from "../features/leaderboard/components/leaderboard-table";

export const Route = createFileRoute("/_app/leaderboard")({
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const termId = currentTermId();
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

      <div className="flex flex-wrap gap-1.5">
        <ViewTab label="Anual" active={view === "annual"} onClick={() => setView("annual")} />
        {months.map((month) => (
          <ViewTab
            key={month}
            label={month}
            active={view === month}
            onClick={() => setView(month)}
          />
        ))}
      </div>

      {isPending && <p className="text-ink-3">Cargando…</p>}
      {isError && <p className="text-error">No se pudo cargar la clasificación.</p>}
      {!isPending && !isError && <LeaderboardTable entries={entries} />}
    </div>
  );
}

function ViewTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-pill px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
        active ? "bg-jci-blue text-white" : "bg-ink-1/[0.05] text-ink-2 hover:bg-ink-1/[0.09]",
      )}
    >
      {label}
    </button>
  );
}
