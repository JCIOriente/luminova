import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button, EmptyState, Icon, Sheet } from "@luminova/ui";
import { Can } from "../lib/authz/ability-context";
import { PageHeader } from "../components/page-header";
import { currentTermId } from "../lib/current-term";
import { useActivitiesByTerm } from "../features/activities/hooks/use-activities-by-term";
import { useCreateActivity } from "../features/activities/hooks/use-create-activity";
import { ActivityForm } from "../features/activities/components/activity-form";
import { ActivityTable } from "../features/activities/components/activity-table";

export const Route = createFileRoute("/_app/activities")({ component: ActivitiesPage });

function ActivitiesPage() {
  const termId = currentTermId();
  const { data: activities, isLoading, isError } = useActivitiesByTerm(termId);
  const create = useCreateActivity(termId);
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Reconocimiento"
        title="Actividades"
        actions={
          <Can I="create" a="Activity">
            <Button
              as="button"
              type="button"
              iconLeft={Icon.plus({ s: 18 })}
              onClick={() => setOpen(true)}
            >
              Nueva actividad
            </Button>
          </Can>
        }
      />
      {isLoading && <p className="text-ink-3">Cargando…</p>}
      {isError && <p className="text-error">No se pudieron cargar las actividades.</p>}
      {activities && activities.length === 0 && (
        <EmptyState
          icon={Icon.calendar({ s: 40 })}
          title={`No hay actividades para ${termId}.`}
          description="Crea una actividad para registrar asistencia."
        />
      )}
      {activities && activities.length > 0 && <ActivityTable activities={activities} />}
      <Sheet open={open} onOpenChange={setOpen} title="Nueva actividad">
        <ActivityForm
          isSaving={create.isPending}
          onSubmit={(data) => create.mutate(data, { onSuccess: () => setOpen(false) })}
        />
      </Sheet>
    </div>
  );
}
