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
import type { InitiativeKind, ParticipationRole, ParticipationState } from "@luminova/types";
import type { ParticipationSummary } from "../lib/participation-summary";

const ROLE_LABEL: Record<ParticipationRole, string> = {
  Director: "Director",
  CoDirector: "Codirector",
  Team: "Equipo",
  Attendee: "Asistente",
};

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

export function ParticipationLedger({ summary }: { summary: ParticipationSummary }) {
  const { rows, activityCount, projects } = summary;

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Icon.spark({ s: 40 })}
        title="Sin participaciones registradas"
        description="Las participaciones aparecerán aquí cuando se registre asistencia."
      />
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[15px] font-semibold text-ink-1">Proyectos y actividades</h2>
          <span className="text-[12px] text-ink-3">
            {plural(activityCount, "actividad", "actividades")}
            {projects.length > 0 && ` · ${plural(projects.length, "iniciativa", "iniciativas")}`}
          </span>
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
      </div>

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
                <span className="font-medium text-ink-1">
                  {row.activityTitle ?? POINT_RULE_LABELS[row.pointRuleCode]}
                </span>
                {row.activityTitle && (
                  <span className="mt-0.5 block text-[12px] text-ink-3">
                    {POINT_RULE_LABELS[row.pointRuleCode]}
                  </span>
                )}
              </TableCell>
              <TableCell>
                {row.parentTitle ? (
                  <span className="text-ink-2">{row.parentTitle}</span>
                ) : (
                  <span className="text-ink-4">—</span>
                )}
              </TableCell>
              <TableCell className="text-ink-2">{ROLE_LABEL[row.role]}</TableCell>
              <TableCell className="tabular-nums">{row.computedPoints}</TableCell>
              <TableCell>
                <Badge tone={STATE_TONE[row.state]} dot>
                  {STATE_LABEL[row.state]}
                </Badge>
              </TableCell>
              <TableCell className="text-ink-2 tabular-nums">{row.monthBucket}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
