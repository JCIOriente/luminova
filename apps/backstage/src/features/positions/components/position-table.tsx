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
import type { Position } from "@luminova/types";
import { RowAction } from "../../../components/row-action";
import { Can } from "../../../lib/authz/ability-context";
import { PERMISSION_ROLE_INFO } from "../lib/permission-labels";

function grantsLabel(position: Position): string {
  if (position.grants.length === 0) return "—";
  return position.grants.map((grant) => PERMISSION_ROLE_INFO[grant].label).join(", ");
}

function PositionActions({
  position,
  onEdit,
  onDeactivate,
}: {
  position: Position;
  onEdit: (position: Position) => void;
  onDeactivate: (position: Position) => void;
}) {
  return (
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
  );
}

interface PositionSectionProps {
  title: string;
  positions: Position[];
  variant: "cargo" | "comision";
  onEdit: (position: Position) => void;
  onDeactivate: (position: Position) => void;
}

export function PositionSection({
  title,
  positions,
  variant,
  onEdit,
  onDeactivate,
}: PositionSectionProps) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-ink-3">{title}</h2>
      {positions.length === 0 ? (
        <EmptyState
          title={variant === "cargo" ? "Sin cargos en esta categoría." : "Sin comisiones."}
        />
      ) : variant === "cargo" ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cargo</TableHead>
              <TableHead>Gestión</TableHead>
              <TableHead>Permisos</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((position) => (
              <TableRow key={position.id}>
                <TableCell className="font-semibold text-ink-1">{position.title}</TableCell>
                <TableCell className="text-ink-2 tabular-nums">{position.term ?? "—"}</TableCell>
                <TableCell className="text-ink-2">{grantsLabel(position)}</TableCell>
                <TableCell className="text-right">
                  <PositionActions
                    position={position}
                    onEdit={onEdit}
                    onDeactivate={onDeactivate}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sigla</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((position) => (
              <TableRow key={position.id}>
                <TableCell className="text-ink-2 font-mono text-sm">
                  {position.sigla ?? "—"}
                </TableCell>
                <TableCell className="font-semibold text-ink-1">{position.title}</TableCell>
                <TableCell className="text-right">
                  <PositionActions
                    position={position}
                    onEdit={onEdit}
                    onDeactivate={onDeactivate}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
