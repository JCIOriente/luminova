import { useMemo } from "react";
import { DataTable, EmptyState, Icon, type DataTableColumn } from "@luminova/ui";
import type { Position, RoleDefinition } from "@luminova/types";
import { RowAction } from "../../../components/row-action";
import { Can } from "../../../lib/authz/ability-context";
import { roleDisplay } from "../../../lib/role-display";
import { useRoles } from "../../permissions/hooks/use-roles";

function grantsLabel(position: Position, roleDocs: RoleDefinition[] | undefined): string {
  if (position.grants.length === 0) return "—";
  return position.grants.map((grant) => roleDisplay(grant, roleDocs).label).join(", ");
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
      {/* Deactivate is a soft-delete = `update` write (positions delete:false); gate
          on update:Position to match the rule, not a delete:Position perm. */}
      <Can I="update" a="Position">
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

function cargoColumns(roleDocs: RoleDefinition[] | undefined): DataTableColumn<Position>[] {
  return [
    {
      id: "title",
      header: "Cargo",
      sortValue: (position) => position.title,
      cell: (position) => <span className="font-semibold text-ink-1">{position.title}</span>,
    },
    {
      id: "term",
      header: "Gestión",
      sortValue: (position) => position.term ?? 0,
      cell: (position) => <span className="tabular-nums text-ink-2">{position.term ?? "—"}</span>,
    },
    {
      id: "grants",
      header: "Permisos",
      sortable: false,
      cell: (position) => <span className="text-ink-2">{grantsLabel(position, roleDocs)}</span>,
    },
  ];
}

const COMISION_COLUMNS: DataTableColumn<Position>[] = [
  {
    id: "sigla",
    header: "Sigla",
    sortValue: (position) => position.sigla ?? "",
    cell: (position) => (
      <span className="font-mono text-sm text-ink-2">{position.sigla ?? "—"}</span>
    ),
  },
  {
    id: "title",
    header: "Nombre",
    sortValue: (position) => position.title,
    cell: (position) => <span className="font-semibold text-ink-1">{position.title}</span>,
  },
];

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
  const { data: roleDocs } = useRoles();
  const columns = useMemo(
    () => (variant === "cargo" ? cargoColumns(roleDocs) : COMISION_COLUMNS),
    [variant, roleDocs],
  );

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-ui-sm font-semibold uppercase tracking-[0.1em] text-ink-3">{title}</h2>
      {positions.length === 0 ? (
        <EmptyState
          title={variant === "cargo" ? "Sin cargos en esta categoría." : "Sin comisiones."}
        />
      ) : (
        <DataTable
          rows={positions}
          columns={columns}
          getRowId={(position) => position.id}
          rowActions={(position) => (
            <PositionActions position={position} onEdit={onEdit} onDeactivate={onDeactivate} />
          )}
        />
      )}
    </section>
  );
}
