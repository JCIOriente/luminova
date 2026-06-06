import {
  Button,
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
    return <p className="text-ink-2">No hay aliados todavía.</p>;
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
            <TableCell className="font-medium">{ally.companyName}</TableCell>
            <TableCell>{ally.personInCharge}</TableCell>
            <TableCell className="text-ink-2">{ally.phone}</TableCell>
            <TableCell className="text-ink-2">{ally.email}</TableCell>
            <TableCell className="text-right">
              <div className="inline-flex gap-2">
                <Button
                  as="button"
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onEdit(ally)}
                >
                  Editar
                </Button>
                <Button
                  as="button"
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onDelete(ally)}
                >
                  Eliminar
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
