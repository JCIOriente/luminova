import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, EmptyState, Icon, Sheet, Dialog, Toast } from "@luminova/ui";
import type { ComboboxOption } from "@luminova/ui";
import { ACTIVITY_CATEGORIES } from "@luminova/types";
import type { Activity, ActivityInput } from "@luminova/types";
import { STANDALONE_CATEGORIES } from "../features/activities/lib/categories";
import { Can, useAbility } from "../lib/authz/ability-context";
import { useAuth } from "../lib/auth/auth";
import { hasRole } from "@luminova/auth/roles";
import { PageHeader } from "../components/page-header";
import { currentTermKey } from "@luminova/types";
import { useMembers } from "../features/members/hooks/use-members";
import { useProgramsByTerm } from "../features/programs/hooks/use-programs-by-term";
import { useProjectsByTerm } from "../features/projects/hooks/use-projects-by-term";
import { useActivitiesByTerm } from "../features/activities/hooks/use-activities-by-term";
import { useCreateActivity } from "../features/activities/hooks/use-create-activity";
import { useUpdateActivity } from "../features/activities/hooks/use-update-activity";
import { useCancelActivity } from "../features/activities/hooks/use-cancel-activity";
import { ActivityRepository } from "../features/activities/repositories/activity-repository";
import { ActivityLockedError } from "../features/activities/repositories/activity-guard";
import { ActivityForm } from "../features/activities/components/activity-form";
import { ActivityTable } from "../features/activities/components/activity-table";
import { activityToInput } from "../features/activities/lib/activity-to-input";
import { isCheckInOpen } from "../features/activities/lib/check-in-window";

export const Route = createFileRoute("/_app/activities")({ component: ActivitiesPage });

type Editing = Activity | "new" | null;

function ActivitiesPage() {
  const termId = currentTermKey();
  const canManage = useAbility().can("update", "Activity");
  const { claims } = useAuth();
  const isAdmin = hasRole(claims, "Admin");
  const { data: activities, isLoading, isError } = useActivitiesByTerm(termId);
  const { data: members } = useMembers();
  const { data: programs } = useProgramsByTerm(termId);
  const { data: projects } = useProjectsByTerm(termId);
  const create = useCreateActivity(termId);
  const update = useUpdateActivity(termId);
  const cancelActivity = useCancelActivity(termId);

  const [editing, setEditing] = useState<Editing>(null);
  const [cancelTarget, setCancelTarget] = useState<Activity | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const memberOptions: ComboboxOption[] = useMemo(
    () => (members ?? []).map((m) => ({ value: m.id, label: m.name })),
    [members],
  );
  const programOptions: ComboboxOption[] = useMemo(
    () => (programs ?? []).map((p) => ({ value: p.id, label: p.title })),
    [programs],
  );
  const projectOptions: ComboboxOption[] = useMemo(
    () => (projects ?? []).map((p) => ({ value: p.id, label: p.title })),
    [projects],
  );

  const { parentTitleById, checkInOpenById } = useMemo(() => {
    const initiatives = [...(programs ?? []), ...(projects ?? [])];
    const titleById: Record<string, string> = {};
    const statusById: Record<string, string> = {};
    for (const i of initiatives) {
      titleById[i.id] = i.title;
      statusById[i.id] = i.status;
    }
    const now = new Date();
    return {
      parentTitleById: titleById,
      checkInOpenById: Object.fromEntries(
        (activities ?? []).map((a) => [
          a.id,
          // parentId set but its status absent from the map (initiatives still
          // loading) → undefined → isCheckInOpen fails closed until they resolve.
          isCheckInOpen(a, a.parentId !== null ? statusById[a.parentId] : null, now, isAdmin),
        ]),
      ),
    };
  }, [activities, programs, projects, isAdmin]);

  const editingId = editing && editing !== "new" ? editing.id : null;
  const { data: checkInCount } = useQuery({
    queryKey: ["activities", "checkin-count", editingId],
    queryFn: () => new ActivityRepository().countCheckIns(editingId as string),
    enabled: editingId !== null,
  });
  const locked = (checkInCount ?? 0) > 0;

  const handleSubmit = async (data: ActivityInput) => {
    try {
      if (editing === "new") await create.mutateAsync(data);
      else if (editing) await update.mutateAsync({ id: editing.id, data });
      setEditing(null);
    } catch (err) {
      setToast(
        err instanceof ActivityLockedError ? err.message : "No se pudo guardar la actividad.",
      );
    }
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    try {
      await cancelActivity.mutateAsync(cancelTarget.id);
    } catch {
      setToast("No se pudo cancelar la actividad.");
    }
    setCancelTarget(null);
  };

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
              onClick={() => setEditing("new")}
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
      {activities && activities.length > 0 && (
        <ActivityTable
          activities={activities}
          onEdit={setEditing}
          onCancel={setCancelTarget}
          canManage={canManage}
          parentTitleById={parentTitleById}
          checkInOpenById={checkInOpenById}
        />
      )}

      <Sheet
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing === "new" ? "Nueva actividad" : "Editar actividad"}
      >
        {editing !== null && (
          <ActivityForm
            key={editing === "new" ? "new" : editing.id}
            defaultValues={editing === "new" ? undefined : activityToInput(editing)}
            categoryOptions={editing === "new" ? STANDALONE_CATEGORIES : ACTIVITY_CATEGORIES}
            memberOptions={memberOptions}
            programOptions={programOptions}
            projectOptions={projectOptions}
            locked={editing !== "new" && locked}
            isSaving={create.isPending || update.isPending}
            submitLabel={editing === "new" ? "Crear" : "Guardar"}
            onSubmit={(data) => void handleSubmit(data)}
          />
        )}
      </Sheet>

      <Dialog
        open={cancelTarget !== null}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title="Cancelar actividad"
        description="¿Cancelar la actividad? Se marcará como Cancelada, no se borra."
      >
        <div className="flex justify-end gap-3">
          <Button
            as="button"
            type="button"
            variant="secondary"
            onClick={() => setCancelTarget(null)}
          >
            Volver
          </Button>
          <Button as="button" type="button" onClick={() => void confirmCancel()}>
            Cancelar actividad
          </Button>
        </div>
      </Dialog>

      {toast && <Toast message={toast} icon={Icon.close({ s: 18 })} />}
    </div>
  );
}
