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
import type { Participation, ParticipationRole, ParticipationState } from "@luminova/types";

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

export function ParticipationLedger({ rows }: { rows: Participation[] }) {
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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fuente</TableHead>
          <TableHead>Rol</TableHead>
          <TableHead>Puntos</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Mes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>{POINT_RULE_LABELS[row.pointRuleCode]}</TableCell>
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
  );
}
