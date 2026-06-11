import { useMemo, useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
  Button,
  Sheet,
  SegmentedControl,
  type ComboboxOption,
  type SegmentedOption,
} from "@luminova/ui";
import type { ActivityInput, InitiativeInput, Member } from "@luminova/types";
import { useAbility } from "../lib/authz/ability-context";
import { InitiativeForm } from "../components/initiative-form";
import { InitiativeHero } from "../features/initiatives/components/initiative-hero";
import { InitiativeSummary } from "../features/initiatives/components/initiative-summary";
import { InitiativeTeamRail } from "../features/initiatives/components/initiative-team-rail";
import { InitiativeActivities } from "../features/initiatives/components/initiative-activities";
import { InitiativeCompleted } from "../features/initiatives/components/initiative-completed";
import { ActivityForm } from "../features/activities/components/activity-form";
import { currentTermId } from "../lib/current-term";
import { useMembers } from "../features/members/hooks/use-members";
import { useActivitiesByTerm } from "../features/activities/hooks/use-activities-by-term";
import { useCreateActivity } from "../features/activities/hooks/use-create-activity";
import { useUpdateProgram } from "../features/programs/hooks/use-update-program";
import { useUpdateProject } from "../features/projects/hooks/use-update-project";
import { useInitiative, KIND, type InitiativeType } from "../features/initiatives/hooks/use-initiative";
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
  const termId = currentTermId();
  const ability = useAbility();

  const canRead = ability.can("read", kind);
  const canUpdate = ability.can("update", kind);
  const canCreateActivity = ability.can("create", "Activity");
  const canReadMembers = ability.can("read", "Member");

  const { data: item, isLoading } = useInitiative(initiativeType, id, { enabled: canRead });
  const { data: activities } = useActivitiesByTerm(termId, { enabled: canRead });
  const { data: members } = useMembers({ enabled: canReadMembers });

  const updateProgram = useUpdateProgram(termId);
  const updateProject = useUpdateProject(termId);
  const createActivity = useCreateActivity(termId);

  const [tab, setTab] = useState<Tab>("resumen");
  const [editOpen, setEditOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

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

  const acts = activities ?? [];
  const now = Date.now();
  const closingSoon = isClosingSoon(item, acts, now);
  const progress = computeProgress(acts, item.id);
  const children = childActivitiesOf(acts, item.kind, item.id);
  const team = buildInitiativeTeam(item.roster, memberById);
  const impact = item.impact;
  const showCompleted = item.status === "Finalizado" && impact !== null;

  const handleUpdate = async (data: InitiativeInput) => {
    if (!canUpdate) return;
    if (item.kind === "Program") await updateProgram.mutateAsync({ id: item.id, data });
    else await updateProject.mutateAsync({ id: item.id, data });
    setEditOpen(false);
  };

  const handleCreateActivity = async (data: ActivityInput) => {
    if (!canCreateActivity) return;
    if (data.parentType !== item.kind || data.parentId !== item.id) return;
    await createActivity.mutateAsync(data);
    setCreateOpen(false);
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
          canUpdate && (
            <Button as="button" type="button" variant="secondary" onClick={() => setEditOpen(true)}>
              Editar
            </Button>
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
          <div className="lg:col-span-2">
            {showCompleted && impact ? (
              <InitiativeCompleted impact={impact} />
            ) : (
              <InitiativeSummary item={item} progress={progress} />
            )}
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

      <Sheet
        open={editOpen}
        onOpenChange={setEditOpen}
        title={`Editar ${item.kind === "Program" ? "programa" : "proyecto"}`}
      >
        <InitiativeForm
          memberOptions={memberOptions}
          defaultValues={initiativeToInput(item)}
          submitLabel="Guardar"
          isSaving={isSavingInitiative}
          onSubmit={(data) => void handleUpdate(data)}
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
    </div>
  );
}
