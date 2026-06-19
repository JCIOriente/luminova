import { DataTable, EmptyState, Icon, type DataTableColumn } from "@luminova/ui";
import type { Ally } from "@luminova/types";
import { RowAction } from "../../../components/row-action";
import { Can } from "../../../lib/authz/ability-context";

interface AllyTableProps {
  allies: Ally[];
  onEdit: (ally: Ally) => void;
  onDelete: (ally: Ally) => void;
}

const columns: DataTableColumn<Ally>[] = [
  {
    id: "company",
    header: "Empresa",
    sortValue: (ally) => ally.companyName,
    cell: (ally) => <span className="font-semibold text-ink-1">{ally.companyName}</span>,
  },
  {
    id: "contact",
    header: "Encargado",
    sortValue: (ally) => ally.contactPerson,
    cell: (ally) => <span className="text-ink-2">{ally.contactPerson}</span>,
  },
  {
    id: "phone",
    header: "Teléfono",
    cell: (ally) => <span className="tabular-nums text-ink-2">{ally.phone}</span>,
  },
  {
    id: "email",
    header: "Correo",
    cell: (ally) => <span className="text-ink-2">{ally.email}</span>,
  },
];

export function AllyTable({ allies, onEdit, onDelete }: AllyTableProps) {
  return (
    <DataTable
      rows={allies}
      columns={columns}
      getRowId={(ally) => ally.id}
      pageSize={16}
      paginationLabel="aliados"
      emptyState={
        <EmptyState
          icon={Icon.handshake({ s: 40 })}
          title="No hay aliados todavía"
          description="Registra empresas y organizaciones aliadas para verlas aquí."
        />
      }
      rowActions={(ally) => (
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
      )}
    />
  );
}
