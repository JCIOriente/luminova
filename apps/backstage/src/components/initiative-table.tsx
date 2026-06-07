import {
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Icon,
  IconButton,
  type BadgeTone,
} from "@luminova/ui";
import type { Program } from "@luminova/types";
import { Can } from "../lib/authz/ability-context";

type Initiative = Pick<Program, "id" | "title" | "roster" | "status" | "finalReport">;

const STATUS_TONE: Record<Initiative["status"], BadgeTone> = {
  Finalizado: "green",
  EnEjecucion: "amber",
  Planificacion: "gray",
};

const STATUS_LABELS: Record<Initiative["status"], string> = {
  Finalizado: "Finalizado",
  EnEjecucion: "En ejecución",
  Planificacion: "Planificación",
};

interface InitiativeTableProps<T extends Initiative> {
  rows: T[];
  subject: "Program" | "Project";
  memberName: (id: string) => string;
  onEdit: (row: T) => void;
  onFileReport: (row: T) => void;
}

export function InitiativeTable<T extends Initiative>({
  rows,
  subject,
  memberName,
  onEdit,
  onFileReport,
}: InitiativeTableProps<T>) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Título</TableHead>
          <TableHead>Director</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Informe final</TableHead>
          <TableHead>Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-semibold text-ink-1">{row.title}</TableCell>
            <TableCell className="text-ink-2">{memberName(row.roster.directorId)}</TableCell>
            <TableCell>
              <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABELS[row.status]}</Badge>
            </TableCell>
            <TableCell className="text-ink-2">{row.finalReport ? "Presentado" : "—"}</TableCell>
            <TableCell>
              <Can I="update" a={subject}>
                <div className="flex gap-2">
                  <IconButton
                    as="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Editar ${row.title}`}
                    onClick={() => onEdit(row)}
                  >
                    {Icon.settings({ s: 17 })}
                  </IconButton>
                  {!row.finalReport && (
                    <IconButton
                      as="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Marcar informe final de ${row.title}`}
                      onClick={() => onFileReport(row)}
                    >
                      {Icon.check({ s: 17 })}
                    </IconButton>
                  )}
                </div>
              </Can>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
