import { useMemo, useState } from "react";
import { Link, getRouteApi } from "@tanstack/react-router";
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
import { hasRole } from "@luminova/auth/roles";
import { useCan } from "../../../lib/authz/use-can";
import { useAuth } from "../../../lib/auth/auth";
import { useActivity } from "../hooks/use-activity";
import { useActivityPhotos } from "../hooks/use-activity-photos";
import { useMembers } from "../../members/hooks/use-members";
import { useInitiativesOfType } from "../../initiatives/hooks/use-initiatives-of-type";
import { useUpdateActivity } from "../hooks/use-update-activity";
import { useCancelActivity } from "../hooks/use-cancel-activity";
import { ActivityRepository } from "../repositories/activity-repository";
import { ActivityLockedError } from "../repositories/activity-guard";
import { QueryErrorState } from "../../../components/query-error-state";
import { ActivityForm } from "./activity-form";
import { ActivityDetailHero } from "./activity-detail-hero";
import { ActivityTeam } from "./activity-team";
import { ActivityDetails } from "./activity-details";
import { ActivityCheckIn } from "../../check-in/components/activity-check-in";
import { activityToInput } from "../lib/activity-to-input";
import { isCheckInOpen } from "../lib/check-in-window";
import { activityKeys } from "../hooks/activity-keys";
import { PhotoManager } from "../../initiatives/components/photo-manager";
import { PhotoGallery } from "../../initiatives/components/photo-gallery";
import { useInitiative } from "../../initiatives/hooks/use-initiative";
import { INITIATIVE_TYPE } from "../../initiatives/lib/initiative-kind";
import { useDismissingToast } from "../../../lib/use-dismissing-toast";

const route = getRouteApi("/_app/activities_/$id");

type Tab = "resumen" | "galeria" | "check-in";

export function ActivityDetailPage() {
  const { id } = route.useParams();
  const termId = currentTermKey();
  const gate = useCan();
  const { user, claims } = useAuth();
  const uid = user?.uid ?? null;
  const isAdmin = hasRole(claims, "Admin");

  const canRead = gate.can("read", "Activity");
  const canUpdate = gate.can("update", "Activity");
  // Unconditional read:Member only — an own-doc grant can't list the collection.
  const canReadMembers = gate.can("read", "Member");

  const [tab, setTab] = useState<Tab>("resumen");
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [toast, setToast] = useDismissingToast();

  // firestore.rules allow `read: if signedIn()` on an activity, so load it for any
  // authenticated viewer — a parent-direction plain Member (who lacks read:Activity but
  // whom the rules grant activityParentDirection writes) needs the doc + its parent to
  // resolve their direction and manage photos. The access gate below still fences the view.
  const { data: activity, isLoading, isError, error, refetch } = useActivity(id, { enabled: true });
  const { data: members } = useMembers({ enabled: canReadMembers });
  // Programs/projects only feed the parent link + the edit sheet's parent picker;
  // skip the reads on parentless activities until the edit sheet is opened.
  // programs/projects lists read collections that are `read: if signedIn()` in the rules
  // and only feed the parent-title lookup + edit-sheet picker, so gate on need alone (not
  // canRead(Activity)) — a parent-direction Member lacks read:Activity but must still see
  // their parent's title. The edit picker stays behind canUpdate, so no write leaks.
  const needsInitiatives = activity?.parentId != null || editOpen;
  const { data: programs } = useInitiativesOfType("program", termId, {
    enabled: needsInitiatives,
  });
  const { data: projects } = useInitiativesOfType("project", termId, {
    enabled: needsInitiatives,
  });

  const update = useUpdateActivity(termId);
  const cancelActivity = useCancelActivity(termId);

  const parentType = activity?.parentType ?? null;
  const parentId = activity?.parentId ?? null;
  const photoActions = useActivityPhotos(id, termId);
  const galleryError = "No se pudo actualizar la galería.";
  // Load the parent for any authenticated viewer (rules: `read: if signedIn()` on both
  // programs and projects) so a parent-direction plain Member — who holds read:Project
  // but never read:Program — can resolve direction on a Program-parented activity too.
  // Gating this on ability.can("read", parentType) left the Program-parent hatch dead.
  const parentInitiative = useInitiative(
    parentType ? INITIATIVE_TYPE[parentType] : "project",
    parentId ?? "",
    { enabled: parentId !== null },
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

  if (isLoading) return <p className="text-ink-3">Cargando…</p>;
  if (isError) return <QueryErrorState error={error} onRetry={() => refetch()} />;
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
  // Access is granted by read:Activity OR being a parent-initiative director; the latter
  // is only known once the parent resolves, so wait for it rather than race the check false.
  if (parentId !== null && parentInitiative.isLoading) {
    return <p className="text-ink-3">Cargando…</p>;
  }
  if (!canRead && !isParentDirection) {
    return (
      <EmptyState
        icon={Icon.calendar({ s: 40 })}
        title="Sin acceso"
        description="No tienes permiso para ver esta actividad."
      />
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

  const canCheckIn = gate.can("checkIn", "Attendance", { eventId: activity.id });
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
      <Link to="/activities" className="text-ui-sm text-ink-3 hover:text-ink-1">
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
              <h2 className="font-mono text-ui-2xs tracking-[0.12em] text-ink-3 uppercase">
                Sobre la actividad
              </h2>
              {activity.description ? (
                <p className="mt-3 text-ui-md leading-relaxed whitespace-pre-line text-ink-2">
                  {activity.description}
                </p>
              ) : (
                <p className="mt-3 text-ui-sm text-ink-3">
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
            <p className="mx-auto max-w-md text-center text-ui-sm text-ink-3">
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
