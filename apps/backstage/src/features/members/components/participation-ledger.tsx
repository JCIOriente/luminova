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
import { POINT_RULE_LABELS } from "@luminova/types";
import type { InitiativeKind, ParticipationState } from "@luminova/types";
import { PARTICIPATION_ROLE_LABEL, type ParticipationSummary } from "../lib/participation-summary";

const STATE_LABEL: Record<ParticipationState, string> = {
  confirmed: "Confirmado",
  provisional: "Provisional",
  voided: "Anulado",
};

const STATE_TONE: Record<ParticipationState, BadgeTone> = {
  confirmed: "green",
  provisional: "gray",
  voided: "red",
};

const KIND_TONE: Record<InitiativeKind, BadgeTone> = {
  Program: "navy",
  Project: "teal",
};

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function ParticipationLedger({
  summary,
  totalPoints,
  termId,
}: {
  summary: ParticipationSummary;
  totalPoints: number;
  termId: string;
}) {
  const { rows, activityCount, projects } = summary;

  if (rows.length === 0) {
    return (
      <section className="rounded-card border border-line bg-surface px-6 py-8">
        <EmptyState
          icon={Icon.spark({ s: 40 })}
          title="Sin participaciones registradas"
          description="Las participaciones aparecerán aquí cuando se registre asistencia."
        />
      </section>
    );
  }

  return (
    <section className="rounded-card border border-line bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
        <div>
          <h2 className="text-[15px] font-semibold text-ink-1">Proyectos y actividades</h2>
          <div className="mt-0.5 text-[12px] text-ink-3">
            {plural(activityCount, "actividad", "actividades")}
            {projects.length > 0 && ` · ${plural(projects.length, "iniciativa", "iniciativas")}`}
          </div>
        </div>
        {projects.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {projects.map((project) => (
              <li key={project.id}>
                <Badge tone={KIND_TONE[project.kind]}>
                  {project.title}
                  <span className="font-normal opacity-70">· {project.activityCount}</span>
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </header>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Actividad</TableHead>
            <TableHead>Iniciativa</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead>Puntos</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Mes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <div className="font-semibold text-ink-1">
                  {row.activityTitle ?? POINT_RULE_LABELS[row.pointRuleCode]}
                </div>
                {row.activityTitle && (
                  <div className="mt-0.5 text-[12.5px] text-ink-3">
                    {POINT_RULE_LABELS[row.pointRuleCode]}
                  </div>
                )}
              </TableCell>
              <TableCell>
                {row.parentTitle ? (
                  <span className="inline-flex items-center gap-2 text-ink-2">
                    <span className="size-2 shrink-0 rounded-full bg-jci-blue" />
                    {row.parentTitle}
                  </span>
                ) : (
                  <span className="text-ink-4">—</span>
                )}
              </TableCell>
              <TableCell className="text-ink-2">{PARTICIPATION_ROLE_LABEL[row.role]}</TableCell>
              <TableCell className="tabular-nums">{row.computedPoints}</TableCell>
              <TableCell>
                <Badge tone={STATE_TONE[row.state]} dot>
                  {STATE_LABEL[row.state]}
                </Badge>
              </TableCell>
              <TableCell>
                <span className="font-mono text-[12px] tracking-[0.02em] text-ink-2">
                  {row.monthBucket}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between border-t border-line px-6 py-4">
        <span className="text-[13px] font-medium text-ink-3">
          Total confirmado · temporada {termId}
        </span>
        <span className="text-[16px] font-semibold text-ink-1 tabular-nums">
          {totalPoints}
          <span className="ml-1 text-[12px] font-medium text-ink-3">pts</span>
        </span>
      </div>
    </section>
  );
}
