import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button, Dialog, EmptyState, Icon, SegmentedControl, Sheet, Toast } from "@luminova/ui";
import type { ComboboxOption, SegmentedOption } from "@luminova/ui";
import type { ActivityInput, Member } from "@luminova/types";
import { currentTermKey } from "@luminova/types";
import { subject } from "@luminova/auth/ability";
import { hasRole } from "@luminova/auth/roles";
import { useAbility } from "../lib/authz/ability-context";
import { useAuth } from "../lib/auth/auth";
import { useActivity } from "../features/activities/hooks/use-activity";
import { useActivityPhotos } from "../features/activities/hooks/use-activity-photos";
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
import { activityToInput } from "../features/activities/lib/activity-to-input";
import { isCheckInOpen } from "../features/activities/lib/check-in-window";
import { activityKeys } from "../features/activities/hooks/activity-keys";
import { PhotoManager } from "../features/initiatives/components/photo-manager";
import { PhotoGallery } from "../features/initiatives/components/photo-gallery";
import { useInitiative, INITIATIVE_TYPE } from "../features/initiatives/hooks/use-initiative";

export const Route = createFileRoute("/_app/activities_/$id")({ component: ActivityDetailPage });

type Tab = "detalle" | "check-in";

function ActivityDetailPage() {
  const { id } = Route.useParams();
  const termId = currentTermKey();
  const ability = useAbility();
  const { user, claims } = useAuth();
  const uid = user?.uid ?? null;
  const isAdmin = hasRole(claims, "Admin");

  const canRead = ability.can("read", "Activity");
  const canUpdate = ability.can("update", "Activity");
  const canReadMembers = ability.can("read", "Member");

  const [tab, setTab] = useState<Tab>("detalle");
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const { data: activity, isLoading } = useActivity(id, { enabled: canRead });
  const { data: members } = useMembers({ enabled: canReadMembers });
  // Programs/projects only feed the parent link + the edit sheet's parent picker;
  // skip the reads on parentless activities until the edit sheet is opened.
  const needsInitiatives = activity?.parentId != null || editOpen;
  const { data: programs } = useProgramsByTerm(termId, { enabled: canRead && needsInitiatives });
  const { data: projects } = useProjectsByTerm(termId, { enabled: canRead && needsInitiatives });

  const update = useUpdateActivity(termId);
  const cancelActivity = useCancelActivity(termId);

  const parentType = activity?.parentType ?? null;
  const parentId = activity?.parentId ?? null;
  const photoActions = useActivityPhotos(id, termId);
  const parentInitiative = useInitiative(
    parentType ? INITIATIVE_TYPE[parentType] : "project",
    parentId ?? "",
    {
      enabled: parentId !== null && ability.can("read", parentType ?? "Project"),
    },
  );
  const isParentDirection =
    uid !== null &&
    parentId !== null &&
    (parentInitiative.data?.directionUids.includes(uid) ?? false);
  const canManagePhotos = canUpdate || isParentDirection;

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

  // The lock only governs the edit form, so the count is only needed once it opens.
  const { data: checkInCount } = useQuery({
    queryKey: activityKeys.checkInCount(id),
    queryFn: () => new ActivityRepository().countCheckIns(id),
    enabled: canRead && editOpen,
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
  const parentPool =
    activity.parentType === "Program"
      ? programs
      : activity.parentType === "Project"
        ? projects
        : null;
  const parent =
    activity.parentId !== null
      ? (parentPool?.find((p) => p.id === activity.parentId) ?? null)
      : null;
  const parentTitle = parent?.title ?? null;

  const canCheckIn = ability.can("checkIn", subject("Attendance", { eventId: activity.id }));
  const checkInOpen = isCheckInOpen(activity, parent?.status ?? null, new Date(), isAdmin);

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

  const hasDetalle = Boolean(activity.description) || activity.photos.length > 0 || canManagePhotos;

  // The check-in tab is only meaningful to users who can register attendance for
  // this activity; hide it from everyone else instead of showing a dead "Sin acceso".
  const tabs: readonly SegmentedOption<Tab>[] = canCheckIn
    ? [
        { value: "detalle", label: "Detalle" },
        { value: "check-in", label: "Check-in" },
      ]
    : [{ value: "detalle", label: "Detalle" }];

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
              <Button
                as="button"
                type="button"
                variant="secondary"
                onClick={() => setEditOpen(true)}
              >
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
            <p className="max-w-2xl text-[14px] leading-relaxed text-ink-2">
              {activity.description}
            </p>
          )}
          {canManagePhotos ? (
            <PhotoManager
              photos={activity.photos}
              onUpload={(blob) => photoActions.addPhoto(blob)}
              onRemove={photoActions.removePhotoById}
              onSetCover={photoActions.setCover}
              onSetCaption={photoActions.setCaption}
            />
          ) : (
            activity.photos.length > 0 && <PhotoGallery photos={activity.photos} showCover />
          )}
          {!hasDetalle && (
            <EmptyState
              title="Sin detalle"
              description="Edita la actividad para agregar una descripción."
            />
          )}
        </div>
      )}

      {tab === "check-in" && canCheckIn && (
        <div className="flex flex-col gap-4">
          {!canReadMembers && (
            <p className="mx-auto max-w-md text-center text-[13px] text-ink-3">
              Modo escáner: registra asistencia con el lector QR.
            </p>
          )}
          <ActivityCheckIn activityId={activity.id} members={members ?? []} open={checkInOpen} />
        </div>
      )}

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
          <Button
            as="button"
            type="button"
            variant="secondary"
            onClick={() => setCancelOpen(false)}
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
