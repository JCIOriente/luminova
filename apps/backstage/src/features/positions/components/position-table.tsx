import {
  Badge,
  Icon,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  type BadgeTone,
} from "@luminova/ui";
import type { Position, PositionCategory } from "@luminova/types";
import { RowAction } from "../../../components/row-action";
import { Can } from "../../../lib/authz/ability-context";
import { PERMISSION_ROLE_INFO } from "../lib/permission-labels";

const CATEGORY_BADGES: Record<PositionCategory, { tone: BadgeTone; label: string }> = {
  CEL: { tone: "navy", label: "CEL" },
  JDL: { tone: "teal", label: "JDL" },
  Comision: { tone: "gray", label: "Comisión" },
};

function grantsLabel(position: Position): string {
  if (position.grants.length === 0) return "—";
  return position.grants.map((grant) => PERMISSION_ROLE_INFO[grant].label).join(", ");
}

interface PositionTableProps {
  positions: Position[];
  onEdit: (position: Position) => void;
  onDeactivate: (position: Position) => void;
}

export function PositionTable({ positions, onEdit, onDeactivate }: PositionTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Cargo</TableHead>
          <TableHead>Variante femenina</TableHead>
          <TableHead>Categoría</TableHead>
          <TableHead>Gestión</TableHead>
          <TableHead>Permisos</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {positions.map((position) => (
          <TableRow key={position.id}>
            <TableCell className="font-semibold text-ink-1">{position.title}</TableCell>
            <TableCell className="text-ink-2">{position.titleFemale}</TableCell>
            <TableCell>
              <Badge tone={CATEGORY_BADGES[position.category].tone}>
                {CATEGORY_BADGES[position.category].label}
              </Badge>
            </TableCell>
            <TableCell className="text-ink-2 tabular-nums">{position.term ?? "—"}</TableCell>
            <TableCell className="text-ink-2">{grantsLabel(position)}</TableCell>
            <TableCell className="text-right">
              <div className="inline-flex gap-1">
                <Can I="update" a="Position">
                  <RowAction
                    icon={Icon.settings({ s: 17 })}
                    label={`Editar ${position.title}`}
                    onClick={() => onEdit(position)}
                  />
                </Can>
                <Can I="delete" a="Position">
                  <RowAction
                    icon={Icon.close({ s: 17 })}
                    label={`Desactivar ${position.title}`}
                    variant="danger"
                    onClick={() => onDeactivate(position)}
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
