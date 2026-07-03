import { useMemo, useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
  Button,
  Card,
  Sheet,
  SegmentedControl,
  Toast,
  Icon,
  type ComboboxOption,
  type SegmentedOption,
} from "@luminova/ui";
import type {
  ActivityInput,
  InitiativeImpactInput,
  InitiativeInput,
  Member,
} from "@luminova/types";
import { useAbility } from "../lib/authz/ability-context";
import { useCan } from "../lib/authz/use-can";
import { useAuth } from "../lib/auth/auth";
import { CompletionWizard } from "../features/initiatives/components/completion-wizard";
import { useCompleteInitiative } from "../features/initiatives/hooks/use-complete-initiative";
import { useInitiativePhotos } from "../features/initiatives/hooks/use-initiative-photos";
import { useDismissingToast } from "../lib/use-dismissing-toast";
import { InitiativeForm } from "../components/initiative-form";
import { InitiativeHero } from "../features/initiatives/components/initiative-hero";
import { InitiativeSummary } from "../features/initiatives/components/initiative-summary";
import { InitiativeTeamRail } from "../features/initiatives/components/initiative-team-rail";
import { InitiativeActivities } from "../features/initiatives/components/initiative-activities";
import { InitiativeCompleted } from "../features/initiatives/components/initiative-completed";
import { PhotoManager } from "../features/initiatives/components/photo-manager";
import { PhotoGallery } from "../features/initiatives/components/photo-gallery";
import { ActivityForm } from "../features/activities/components/activity-form";
import { currentTermKey } from "@luminova/types";
import { useMembers } from "../features/members/hooks/use-members";
import { useActivitiesByTerm } from "../features/activities/hooks/use-activities-by-term";
import { useCreateActivity } from "../features/activities/hooks/use-create-activity";
import { useUpdateProgram } from "../features/programs/hooks/use-update-program";
import { useUpdateProject } from "../features/projects/hooks/use-update-project";
import {
  useInitiative,
  KIND,
  type InitiativeType,
} from "../features/initiatives/hooks/use-initiative";
import { initiativeToInput } from "../features/initiatives/repositories/initiative-mapper";
import {
  computeProgress,
  isClosingSoon,
  childActivitiesOf,
} from "../features/initiatives/lib/derive";
import { buildInitiativeTeam } from "../features/initiatives/lib/team";

export const Route = createFileRoute("/_app/initiatives_/$type/$id")({
  beforeLoad: ({ params }) => {
    if (params.type !== "program" && params.type !== "project") throw notFound();
  },
  component: InitiativeDetailPage,
});

type Tab = "resumen" | "actividades";

function InitiativeDetailPage() {
  const { type, id } = Route.useParams();
  const initiativeType = type as InitiativeType;
  const kind = KIND[initiativeType];
  const termId = currentTermKey();
  const ability = useAbility();
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const canRead = ability.can("read", kind);
  const canUpdate = ability.can("update", kind);
  const canFeature = useCan().canFeatureInitiatives;
  const canCreateActivity = ability.can("create", "Activity");
  const canReadMembers = ability.can("read", "Member");

  const { data: item, isLoading } = useInitiative(initiativeType, id, { enabled: canRead });
  const { data: activities } = useActivitiesByTerm(termId, { enabled: canRead });
  const { data: members } = useMembers({ enabled: canReadMembers });

  const updateProgram = useUpdateProgram(termId);
  const updateProject = useUpdateProject(termId);
  const completeInitiative = useCompleteInitiative(initiativeType, termId);
  const createActivity = useCreateActivity(termId);
  const photoActions = useInitiativePhotos(initiativeType, id, item?.termId ?? termId);

  const [tab, setTab] = useState<Tab>("resumen");
  const [editOpen, setEditOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [errorToast, setErrorToast] = useDismissingToast();

  const memberById = useMemo(
    () => new Map<string, Member>((members ?? []).map((m) => [m.id, m])),
    [members],
  );
  const memberOptions: ComboboxOption[] = useMemo(
    () => (members ?? []).map((m) => ({ value: m.id, label: m.name })),
    [members],
  );

  if (isLoading) return <p className="text-ink-3">Cargando…</p>;
  if (!item) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-ink-2">Proyecto no encontrado.</p>
        <Link to="/initiatives" className="text-jci-blue hover:underline">
          ← Volver a Proyectos
        </Link>
      </div>
    );
  }

  const isDirection = uid !== null && item.directionUids.includes(uid);
  const isCompleted = item.status === "Finalizado" || item.finalReport !== null;
  const canComplete = (canUpdate || isDirection) && !isCompleted;
  const canManagePhotos = canUpdate || isDirection;
  const kindLabel = item.kind === "Program" ? "programa" : "proyecto";

  const acts = activities ?? [];
  const now = Date.now();
  const closingSoon = isClosingSoon(item, acts, now);
  const progress = computeProgress(acts, item.kind, item.id);
  const children = childActivitiesOf(acts, item.kind, item.id);
  const team = buildInitiativeTeam(item.roster, memberById);

  const handleUpdate = async (data: InitiativeInput) => {
    if (!canUpdate) return;
    try {
      if (item.kind === "Program") await updateProgram.mutateAsync({ id: item.id, data });
      else await updateProject.mutateAsync({ id: item.id, data });
      setEditOpen(false);
    } catch {
      setErrorToast("No se pudo guardar. Revisa tus permisos e intenta de nuevo.");
    }
  };

  const handleComplete = async (impact: InitiativeImpactInput) => {
    if (!canComplete || uid === null) return;
    try {
      await completeInitiative.mutateAsync({ id: item.id, impact, uid });
      setCompleteOpen(false);
    } catch {
      setErrorToast("No se pudo finalizar. Revisa tus permisos e intenta de nuevo.");
    }
  };

  const handleCreateActivity = async (data: ActivityInput) => {
    if (!canCreateActivity) return;
    if (data.parentType !== item.kind || data.parentId !== item.id) return;
    try {
      await createActivity.mutateAsync(data);
      setCreateOpen(false);
    } catch {
      setErrorToast("No se pudo crear la actividad.");
    }
  };

  // Photo mutations otherwise reject silently. Toast the failure and RE-THROW so
  // PhotoManager keeps its caption/remove UI open for a retry instead of closing
  // optimistically. Upload is excluded — ImageUploader surfaces its own inline error
  // and keeps the crop open — so it only toasts.
  const galleryError = "No se pudo actualizar la galería.";
  const rethrowPhoto =
    <A extends unknown[]>(fn: (...a: A) => Promise<void>) =>
    (...a: A) =>
      fn(...a).catch((err) => {
        setErrorToast(galleryError);
        throw err;
      });
  const photo = {
    addPhoto: (...a: Parameters<typeof photoActions.addPhoto>) =>
      photoActions.addPhoto(...a).catch(() => setErrorToast(galleryError)),
    removePhotoById: rethrowPhoto(photoActions.removePhotoById),
    setCover: rethrowPhoto(photoActions.setCover),
    setCaption: rethrowPhoto(photoActions.setCaption),
  };

  const isSavingInitiative = updateProgram.isPending || updateProject.isPending;

  const tabs: readonly SegmentedOption<Tab>[] = [
    { value: "resumen", label: "Resumen" },
    { value: "actividades", label: `Actividades ${progress.executed}/${progress.total}` },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Link to="/initiatives" className="text-[13px] text-ink-3 hover:text-ink-1">
        ← Volver a Proyectos
      </Link>

      <InitiativeHero
        item={item}
        closingSoon={closingSoon}
        actions={
          (canUpdate || canComplete) && (
            <div className="flex gap-2">
              {canUpdate && (
                <Button
                  as="button"
                  type="button"
                  variant="secondary"
                  onClick={() => setEditOpen(true)}
                >
                  Editar
                </Button>
              )}
              {canComplete && (
                <Button as="button" type="button" onClick={() => setCompleteOpen(true)}>
                  Finalizar
                </Button>
              )}
            </div>
          )
        }
      />

      <SegmentedControl<Tab>
        aria-label="Vistas del proyecto"
        options={tabs}
        value={tab}
        onChange={setTab}
      />

      {tab === "resumen" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 flex flex-col gap-6">
            {item.impact ? (
              <InitiativeCompleted impact={item.impact} activities={children} />
            ) : (
              <InitiativeSummary item={item} progress={progress} />
            )}
            <Card as="section" className="flex flex-col gap-3">
              <h2 className="text-[15px] font-semibold text-ink-1">Destacadas</h2>
              {canManagePhotos ? (
                <PhotoManager
                  photos={item.photos}
                  onUpload={photo.addPhoto}
                  onRemove={photo.removePhotoById}
                  onSetCover={photo.setCover}
                  onSetCaption={photo.setCaption}
                />
              ) : (
                <PhotoGallery photos={item.photos} showCover />
              )}
            </Card>
          </div>
          <aside>
            <InitiativeTeamRail team={team} />
          </aside>
        </div>
      )}

      {tab === "actividades" && (
        <InitiativeActivities
          activities={children}
          canCreate={canCreateActivity}
          onCreate={() => setCreateOpen(true)}
        />
      )}

      <Sheet open={editOpen} onOpenChange={setEditOpen} title={`Editar ${kindLabel}`}>
        <InitiativeForm
          memberOptions={memberOptions}
          defaultValues={initiativeToInput(item)}
          submitLabel="Guardar"
          isSaving={isSavingInitiative}
          lockStatus={isCompleted}
          canFeature={canFeature}
          onSubmit={(data) => void handleUpdate(data)}
        />
      </Sheet>

      <Sheet open={completeOpen} onOpenChange={setCompleteOpen} title={`Finalizar ${kindLabel}`}>
        <CompletionWizard
          initiativeLabel={kindLabel}
          isSaving={completeInitiative.isPending}
          onComplete={(impact) => void handleComplete(impact)}
          photos={item.photos}
          onUploadPhoto={photo.addPhoto}
          onRemovePhoto={photo.removePhotoById}
          onSetCover={photo.setCover}
          onSetCaption={photo.setCaption}
        />
      </Sheet>

      <Sheet open={createOpen} onOpenChange={setCreateOpen} title="Nueva actividad">
        <ActivityForm
          lockParent
          defaultValues={{
            category: "ProjectExecution",
            parentType: item.kind,
            parentId: item.id,
          }}
          memberOptions={memberOptions}
          programOptions={[]}
          projectOptions={[]}
          isSaving={createActivity.isPending}
          submitLabel="Crear"
          onSubmit={(data) => void handleCreateActivity(data)}
        />
      </Sheet>
      {errorToast && <Toast message={errorToast} icon={Icon.close({ s: 18 })} />}
    </div>
  );
}
