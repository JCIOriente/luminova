import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Card,
  Dialog,
  EmptyState,
  Icon,
  SegmentedControl,
  Sheet,
  Toast,
} from "@luminova/ui";
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
import { ActivityTeam } from "../features/activities/components/activity-team";
import { ActivityDetails } from "../features/activities/components/activity-details";
import { ActivityCheckIn } from "../features/check-in/components/activity-check-in";
import { activityToInput } from "../features/activities/lib/activity-to-input";
import { isCheckInOpen } from "../features/activities/lib/check-in-window";
import { activityKeys } from "../features/activities/hooks/activity-keys";
import { PhotoManager } from "../features/initiatives/components/photo-manager";
import { PhotoGallery } from "../features/initiatives/components/photo-gallery";
import { useInitiative, INITIATIVE_TYPE } from "../features/initiatives/hooks/use-initiative";
import { useDismissingToast } from "../lib/use-dismissing-toast";

export const Route = createFileRoute("/_app/activities_/$id")({ component: ActivityDetailPage });

type Tab = "resumen" | "galeria" | "check-in";

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

  const [tab, setTab] = useState<Tab>("resumen");
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [toast, setToast] = useDismissingToast();

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
  const galleryError = "No se pudo actualizar la galería.";
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
  // parentId set but `parent` not yet resolved → parent?.status is undefined →
  // isCheckInOpen fails closed until programs/projects load.
  const parentStatus = activity.parentId === null ? null : parent?.status;
  const checkInOpen = isCheckInOpen(activity, parentStatus, new Date(), isAdmin);

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

  // The check-in tab is only meaningful to users who can register attendance for
  // this activity; hide it from everyone else instead of showing a dead "Sin acceso".
  const tabs: readonly SegmentedOption<Tab>[] = [
    { value: "resumen", label: "Resumen" },
    { value: "galeria", label: "Galería" },
    ...(canCheckIn ? [{ value: "check-in" as const, label: "Check-in" }] : []),
  ];
  // Fall back to Resumen if the active tab leaves the set (e.g. a user who loses
  // check-in ability while parked on that tab) so no blank, unselected panel shows.
  const activeTab: Tab = tabs.some((t) => t.value === tab) ? tab : "resumen";

  return (
    <div className="flex flex-col gap-6">
      <Link to="/activities" className="text-[13px] text-ink-3 hover:text-ink-1">
        ← Volver a Actividades
      </Link>

      <ActivityDetailHero
        activity={activity}
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
        value={activeTab}
        onChange={setTab}
      />

      {activeTab === "resumen" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="flex flex-col gap-6">
            <Card as="section">
              <h2 className="font-mono text-[10.5px] tracking-[0.12em] text-ink-3 uppercase">
                Sobre la actividad
              </h2>
              {activity.description ? (
                <p className="mt-3 text-[14px] leading-relaxed whitespace-pre-line text-ink-2">
                  {activity.description}
                </p>
              ) : (
                <p className="mt-3 text-[13px] text-ink-3">
                  Edita la actividad para agregar una descripción.
                </p>
              )}
            </Card>
            <ActivityTeam director={director} coDirectors={coDirectors} />
          </div>
          <ActivityDetails activity={activity} />
        </div>
      )}

      {activeTab === "galeria" && (
        <div className="flex flex-col gap-6">
          {canManagePhotos ? (
            <PhotoManager
              photos={activity.photos}
              // Upload: ImageUploader owns its own error + keeps the crop, so just toast.
              onUpload={(blob) => photoActions.addPhoto(blob).catch(() => setToast(galleryError))}
              // Remove/cover/caption: toast AND re-throw so PhotoManager keeps its UI open
              // for a retry instead of closing optimistically on a denied write.
              onRemove={(id) =>
                photoActions.removePhotoById(id).catch((err) => {
                  setToast(galleryError);
                  throw err;
                })
              }
              onSetCover={(id) =>
                photoActions.setCover(id).catch((err) => {
                  setToast(galleryError);
                  throw err;
                })
              }
              onSetCaption={(id, caption) =>
                photoActions.setCaption(id, caption).catch((err) => {
                  setToast(galleryError);
                  throw err;
                })
              }
            />
          ) : activity.photos.length > 0 ? (
            <PhotoGallery photos={activity.photos} showCover />
          ) : (
            <EmptyState title="Sin fotos" description="Aún no hay fotos de esta actividad." />
          )}
        </div>
      )}

      {activeTab === "check-in" && (
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
