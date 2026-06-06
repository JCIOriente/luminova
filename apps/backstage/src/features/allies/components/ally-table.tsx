import {
  EmptyState,
  Icon,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@luminova/ui";
import type { Ally } from "../types/ally";

interface AllyTableProps {
  allies: Ally[];
  onEdit: (ally: Ally) => void;
  onDelete: (ally: Ally) => void;
}

export function AllyTable({ allies, onEdit, onDelete }: AllyTableProps) {
  if (allies.length === 0) {
    return (
      <EmptyState
        icon={Icon.handshake({ s: 40 })}
        title="No hay aliados todavía"
        description="Registra empresas y organizaciones aliadas para verlas aquí."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Empresa</TableHead>
          <TableHead>Encargado</TableHead>
          <TableHead>Teléfono</TableHead>
          <TableHead>Correo</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {allies.map((ally) => (
          <TableRow key={ally.id}>
            <TableCell className="font-semibold text-ink-1">{ally.companyName}</TableCell>
            <TableCell className="text-ink-2">{ally.personInCharge}</TableCell>
            <TableCell className="text-ink-2 tabular-nums">{ally.phone}</TableCell>
            <TableCell className="text-ink-2">{ally.email}</TableCell>
            <TableCell className="text-right">
              <div className="inline-flex gap-1">
                <button
                  type="button"
                  onClick={() => onEdit(ally)}
                  aria-label={`Editar a ${ally.companyName}`}
                  className="flex size-8 items-center justify-center rounded-[8px] text-ink-3 transition-colors hover:bg-ink-1/[0.04] hover:text-ink-1"
                >
                  {Icon.settings({ s: 17 })}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(ally)}
                  aria-label={`Eliminar a ${ally.companyName}`}
                  className="flex size-8 items-center justify-center rounded-[8px] text-ink-3 transition-colors hover:bg-error/10 hover:text-error"
                >
                  {Icon.close({ s: 17 })}
                </button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
