import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button, Dialog, EmptyState, Icon, SegmentedControl, Sheet, Toast } from "@luminova/ui";
import type { ComboboxOption, SegmentedOption } from "@luminova/ui";
import type { Activity, ActivityInput, Member } from "@luminova/types";
import { currentTermKey } from "@luminova/types";
import { subject } from "@luminova/auth/ability";
import { useAbility } from "../lib/authz/ability-context";
import { useActivity } from "../features/activities/hooks/use-activity";
import { useMembers } from "../features/members/hooks/use-members";
import { useProgramsByTerm } from "../features/programs/hooks/use-programs-by-term";
import { useProjectsByTerm } from "../features/projects/hooks/use-projects-by-term";
import { useUpdateActivity } from "../features/activities/hooks/use-update-activity";
import { useCancelActivity } from "../features/activities/hooks/use-cancel-activity";
import { ActivityRepository } from "../features/activities/repositories/activity-repository";
import { ActivityLockedError } from "../features/activities/repositories/activity-guard";
import { ActivityForm } from "../features/activities/components/activity-form";
import { ActivityDetailHero } from "../features/activities/components/activity-detail-hero";
import { ActivityCheckIn } from "../features/check-in/components/activity-check-in";

export const Route = createFileRoute("/_app/activities_/$id")({ component: ActivityDetailPage });

type Tab = "detalle" | "check-in";

function activityToInput(a: Activity): Partial<ActivityInput> {
  return {
    title: a.title,
    description: a.description ?? "",
    category: a.category,
    parentType: a.parentType,
    parentId: a.parentId,
    startAt: new Date(a.startAt.toMillis()).toISOString().slice(0, 16),
    endAt: a.endAt === null ? null : new Date(a.endAt.toMillis()).toISOString().slice(0, 16),
    directorId: a.organizers.directorId,
    coDirectorIds: a.organizers.coDirectorIds,
  };
}

function ActivityDetailPage() {
  const { id } = Route.useParams();
  const termId = currentTermKey();
  const ability = useAbility();

  const canRead = ability.can("read", "Activity");
  const canUpdate = ability.can("update", "Activity");
  const canReadMembers = ability.can("read", "Member");

  const { data: activity, isLoading } = useActivity(id, { enabled: canRead });
  const { data: members } = useMembers({ enabled: canReadMembers });
  const { data: programs } = useProgramsByTerm(termId, { enabled: canRead });
  const { data: projects } = useProjectsByTerm(termId, { enabled: canRead });

  const update = useUpdateActivity(termId);
  const cancelActivity = useCancelActivity(termId);

  const [tab, setTab] = useState<Tab>("detalle");
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const memberById = useMemo(
    () => new Map<string, Member>((members ?? []).map((m) => [m.id, m])),
    [members],
  );
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

  const { data: checkInCount } = useQuery({
    queryKey: ["activities", "checkin-count", id],
    queryFn: () => new ActivityRepository().countCheckIns(id),
    enabled: canRead,
  });
  const locked = (checkInCount ?? 0) > 0;

  if (!canRead) {
    return (
      <EmptyState
        icon={Icon.calendar({ s: 40 })}
        title="Sin acceso"
        description="No tienes permiso para ver esta actividad."
      />
    );
  }
  if (isLoading) return <p className="text-ink-3">Cargando…</p>;
  if (!activity) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-ink-2">Actividad no encontrada.</p>
        <Link to="/activities" className="text-jci-blue hover:underline">
          ← Volver a Actividades
        </Link>
      </div>
    );
  }

  const director = activity.organizers.directorId
    ? (memberById.get(activity.organizers.directorId) ?? null)
    : null;
  const coDirectors = activity.organizers.coDirectorIds
    .map((cid) => memberById.get(cid))
    .filter((m): m is Member => m !== undefined);
  const parentTitle =
    activity.parentId && activity.parentType === "Program"
      ? ((programs ?? []).find((p) => p.id === activity.parentId)?.title ?? null)
      : activity.parentId && activity.parentType === "Project"
        ? ((projects ?? []).find((p) => p.id === activity.parentId)?.title ?? null)
        : null;

  const canCheckIn = ability.can("checkIn", subject("Attendance", { eventId: activity.id }));

  const handleUpdate = async (data: ActivityInput) => {
    if (!canUpdate) return;
    try {
      await update.mutateAsync({ id: activity.id, data });
      setEditOpen(false);
    } catch (err) {
      setToast(
        err instanceof ActivityLockedError ? err.message : "No se pudo guardar la actividad.",
      );
    }
  };

  const confirmCancel = async () => {
    try {
      await cancelActivity.mutateAsync(activity.id);
    } catch {
      setToast("No se pudo cancelar la actividad.");
    }
    setCancelOpen(false);
  };

  const tabs: readonly SegmentedOption<Tab>[] = [
    { value: "detalle", label: "Detalle" },
    { value: "check-in", label: "Check-in" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Link to="/activities" className="text-[13px] text-ink-3 hover:text-ink-1">
        ← Volver a Actividades
      </Link>

      <ActivityDetailHero
        activity={activity}
        director={director}
        coDirectors={coDirectors}
        parentTitle={parentTitle}
        actions={
          canUpdate &&
          activity.status !== "Cancelada" && (
            <>
              <Button as="button" type="button" variant="secondary" onClick={() => setEditOpen(true)}>
                Editar
              </Button>
              <Button as="button" type="button" variant="ghost" onClick={() => setCancelOpen(true)}>
                Cancelar
              </Button>
            </>
          )
        }
      />

      <SegmentedControl<Tab>
        aria-label="Vistas de la actividad"
        options={tabs}
        value={tab}
        onChange={setTab}
      />

      {tab === "detalle" && (
        <div className="flex flex-col gap-6">
          {activity.description && (
            <p className="max-w-2xl text-[14px] leading-relaxed text-ink-2">{activity.description}</p>
          )}
          {activity.photos.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {activity.photos.map((photo, i) => (
                <img
                  key={photo.url}
                  src={photo.url}
                  alt={`${activity.title} — foto ${i + 1}`}
                  className="aspect-[4/3] w-full rounded-card border border-line object-cover"
                />
              ))}
            </div>
          )}
          {!activity.description && activity.photos.length === 0 && (
            <EmptyState
              title="Sin detalle"
              description="Edita la actividad para agregar una descripción."
            />
          )}
        </div>
      )}

      {tab === "check-in" &&
        (canCheckIn ? (
          <ActivityCheckIn activityId={activity.id} members={members ?? []} />
        ) : (
          <EmptyState
            icon={Icon.qr({ s: 40 })}
            title="Sin acceso"
            description="El registro de asistencia está disponible para administración y dirección de proyectos."
          />
        ))}

      <Sheet open={editOpen} onOpenChange={setEditOpen} title="Editar actividad">
        <ActivityForm
          key={activity.id}
          defaultValues={activityToInput(activity)}
          memberOptions={memberOptions}
          programOptions={programOptions}
          projectOptions={projectOptions}
          locked={locked}
          isSaving={update.isPending}
          submitLabel="Guardar"
          onSubmit={(data) => void handleUpdate(data)}
        />
      </Sheet>

      <Dialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancelar actividad"
        description="¿Cancelar la actividad? Se marcará como Cancelada, no se borra."
      >
        <div className="flex justify-end gap-3">
          <Button as="button" type="button" variant="secondary" onClick={() => setCancelOpen(false)}>
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
