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
import type { Ally } from "@luminova/types";
import { RowAction } from "../../../components/row-action";
import { Can } from "../../../lib/authz/ability-context";

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
            <TableCell className="text-ink-2">{ally.contactPerson}</TableCell>
            <TableCell className="text-ink-2 tabular-nums">{ally.phone}</TableCell>
            <TableCell className="text-ink-2">{ally.email}</TableCell>
            <TableCell className="text-right">
              <div className="inline-flex gap-1">
                <Can I="update" a="Ally">
                  <RowAction
                    icon={Icon.settings({ s: 17 })}
                    label={`Editar a ${ally.companyName}`}
                    onClick={() => onEdit(ally)}
                  />
                </Can>
                <Can I="delete" a="Ally">
                  <RowAction
                    icon={Icon.close({ s: 17 })}
                    label={`Eliminar a ${ally.companyName}`}
                    variant="danger"
                    onClick={() => onDelete(ally)}
                  />
                </Can>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
