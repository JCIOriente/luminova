import {
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Icon,
  type BadgeTone,
} from "@luminova/ui";
import type { Program } from "@luminova/types";

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
  memberName: (id: string) => string;
  onEdit: (row: T) => void;
  onFileReport: (row: T) => void;
}

export function InitiativeTable<T extends Initiative>({
  rows,
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
              <div className="flex gap-2">
                <button
                  type="button"
                  aria-label={`Editar ${row.title}`}
                  onClick={() => onEdit(row)}
                  className="text-ink-2 hover:text-ink-1"
                >
                  {Icon.settings({ s: 17 })}
                </button>
                {!row.finalReport && (
                  <button
                    type="button"
                    aria-label={`Marcar informe final de ${row.title}`}
                    onClick={() => onFileReport(row)}
                    className="text-ink-2 hover:text-ink-1"
                  >
                    {Icon.check({ s: 17 })}
                  </button>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
