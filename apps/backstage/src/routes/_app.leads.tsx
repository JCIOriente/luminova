import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Button,
  Dialog,
  Icon,
  SearchInput,
  Select,
  SegmentedControl,
  Toast,
  EmptyState,
} from "@luminova/ui";
import { LEAD_INTENTS, type Lead, type LeadStatus } from "@luminova/types";
import { useLeads } from "../features/leads/hooks/use-leads";
import { useUpdateLeadStatus } from "../features/leads/hooks/use-update-lead-status";
import { useDeleteLead } from "../features/leads/hooks/use-delete-lead";
import { LeadTable } from "../features/leads/components/lead-table";
import {
  filterLeads,
  statusCounts,
  type IntentFilter,
  type StatusFilter,
} from "../features/leads/lib/lead-filter";
import { PageHeader } from "../components/page-header";
import { QueryErrorState } from "../components/query-error-state";
import { useAbility } from "../lib/authz/ability-context";
import { useDismissingToast } from "../lib/use-dismissing-toast";

export const Route = createFileRoute("/_app/leads")({
  component: LeadsPage,
});

const NO_LEADS: Lead[] = [];

function LeadsPage() {
  const ability = useAbility();
  const canRead = ability.can("read", "Lead");
  const canUpdate = ability.can("update", "Lead");
  const { data: leads, isLoading, isError, error, refetch } = useLeads({ enabled: canRead });
  const updateStatus = useUpdateLeadStatus();
  const deleteLead = useDeleteLead();

  const [search, setSearch] = useState("");
  const [intent, setIntent] = useState<IntentFilter>("Todos");
  const [status, setStatus] = useState<StatusFilter>("Todos");
  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null);
  const [errorToast, setErrorToast] = useDismissingToast();

  const all = leads ?? NO_LEADS;
  const counts = useMemo(() => statusCounts(all), [all]);
  const filtered = useMemo(
    () => filterLeads(all, { search, intent, status }),
    [all, search, intent, status],
  );

  const statusOptions: { value: StatusFilter; label: string }[] = [
    { value: "Todos", label: `Todos (${counts.Todos})` },
    { value: "Nuevo", label: `Nuevos (${counts.Nuevo})` },
    { value: "Contactado", label: `Contactados (${counts.Contactado})` },
    { value: "Cerrado", label: `Cerrados (${counts.Cerrado})` },
  ];

  const handleStatusChange = (lead: Lead, next: LeadStatus) => {
    updateStatus.mutate(
      { id: lead.id, status: next },
      { onError: () => setErrorToast("No se pudo actualizar el estado.") },
    );
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteLead.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      setErrorToast("No se pudo eliminar el prospecto.");
    }
  };

  if (!canRead) {
    return (
      <EmptyState
        icon={Icon.lock({ s: 40 })}
        title="Acceso restringido"
        description="No tienes permiso para ver los prospectos. Pídele acceso a un administrador."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Gestión"
        title="Prospectos"
        subtitle="Personas que nos escribieron desde el sitio público."
      />

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          label="Buscar prospectos"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, email o mensaje…"
        />
        <Select
          aria-label="Filtrar por intento"
          value={intent}
          onChange={(e) => setIntent(e.target.value as IntentFilter)}
        >
          <option value="Todos">Todos los intentos</option>
          {LEAD_INTENTS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
      </div>

      <SegmentedControl
        aria-label="Filtrar por estado"
        options={statusOptions}
        value={status}
        onChange={setStatus}
      />

      {isError ? (
        <QueryErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <LeadTable
          leads={filtered}
          isLoading={isLoading}
          canUpdate={canUpdate}
          onStatusChange={handleStatusChange}
          onDelete={setDeleteTarget}
          emptyState={
            all.length > 0 ? (
              <EmptyState
                icon={Icon.search({ s: 40 })}
                title="Sin resultados"
                description="Ningún prospecto coincide con los filtros."
              />
            ) : undefined
          }
        />
      )}

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Eliminar prospecto"
        description={
          deleteTarget
            ? `¿Eliminar el prospecto de ${deleteTarget.name}? Se archivará, no se borra definitivamente.`
            : undefined
        }
      >
        <div className="flex justify-end gap-3">
          <Button
            as="button"
            type="button"
            variant="secondary"
            onClick={() => setDeleteTarget(null)}
          >
            Cancelar
          </Button>
          <Button as="button" type="button" onClick={() => void confirmDelete()}>
            Eliminar
          </Button>
        </div>
      </Dialog>
      {errorToast && <Toast message={errorToast} icon={Icon.close({ s: 18 })} />}
    </div>
  );
}
