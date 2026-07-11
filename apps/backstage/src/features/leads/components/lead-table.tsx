import { useMemo } from "react";
import {
  DataTable,
  Badge,
  Select,
  Button,
  Icon,
  EmptyState,
  type DataTableColumn,
  type BadgeTone,
} from "@luminova/ui";
import { LEAD_STATUSES, type Lead, type LeadIntent, type LeadStatus } from "@luminova/types";
import { formatDateTime } from "@luminova/utils/datetime";

interface LeadTableProps {
  leads: Lead[];
  isLoading?: boolean;
  emptyState?: React.ReactNode;
  onStatusChange: (lead: Lead, status: LeadStatus) => void;
  onDelete: (lead: Lead) => void;
}

const INTENT_TONE: Record<LeadIntent, BadgeTone> = {
  Membresía: "green",
  Alianza: "blue",
  Prensa: "amber",
  Otro: "gray",
};

function buildColumns(
  onStatusChange: (lead: Lead, status: LeadStatus) => void,
): DataTableColumn<Lead>[] {
  return [
    {
      id: "name",
      header: "Prospecto",
      sortValue: (lead) => lead.name,
      cell: (lead) => (
        <div className="min-w-0">
          <div className="truncate font-semibold text-ink-1">{lead.name}</div>
          <a
            href={`mailto:${lead.email}`}
            className="truncate text-ui-xs text-ink-3 hover:text-ink-2"
          >
            {lead.email}
          </a>
        </div>
      ),
    },
    {
      id: "intent",
      header: "Intento",
      sortValue: (lead) => lead.intent,
      cell: (lead) => <Badge tone={INTENT_TONE[lead.intent]}>{lead.intent}</Badge>,
    },
    {
      id: "message",
      header: "Mensaje",
      sortable: false,
      cell: (lead) => (
        <p className="m-0 line-clamp-2 max-w-md text-ui-sm text-ink-2" title={lead.message}>
          {lead.message}
        </p>
      ),
    },
    {
      id: "createdAt",
      header: "Recibido",
      sortValue: (lead) => lead.createdAt.toMillis(),
      cell: (lead) => (
        <span className="whitespace-nowrap text-ui-xs text-ink-3">
          {formatDateTime(lead.createdAt)}
        </span>
      ),
    },
    {
      id: "status",
      header: "Estado",
      sortValue: (lead) => lead.status,
      cell: (lead) => (
        <Select
          aria-label={`Estado de ${lead.name}`}
          value={lead.status}
          onChange={(e) => onStatusChange(lead, e.target.value as LeadStatus)}
        >
          {LEAD_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </Select>
      ),
    },
  ];
}

export function LeadTable({ leads, isLoading, emptyState, onStatusChange, onDelete }: LeadTableProps) {
  const columns = useMemo(() => buildColumns(onStatusChange), [onStatusChange]);
  return (
    <DataTable
      rows={leads}
      columns={columns}
      getRowId={(lead) => lead.id}
      isLoading={isLoading}
      pageSize={12}
      pageSizeOptions={[12, 24, 48]}
      paginationLabel="prospectos"
      emptyState={
        emptyState ?? (
          <EmptyState
            icon={Icon.mail({ s: 40 })}
            title="Sin prospectos todavía"
            description="Cuando alguien complete el formulario de contacto, aparecerá aquí."
          />
        )
      }
      rowActions={(lead) => (
        <Button
          as="button"
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Eliminar prospecto de ${lead.name}`}
          onClick={() => onDelete(lead)}
        >
          {Icon.close({ s: 16 })}
        </Button>
      )}
    />
  );
}
