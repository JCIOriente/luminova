import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button, Icon, EmptyState, SegmentedControl, Sheet, Toast } from "@luminova/ui";
import { useDismissingToast } from "../../../lib/use-dismissing-toast";
import type { ComboboxOption } from "@luminova/ui";
import type { InitiativeInput, Member } from "@luminova/types";
import { useAbility } from "../../../lib/authz/ability-context";
import { useCan } from "../../../lib/authz/use-can";
import { PageHeader } from "../../../components/page-header";
import { InitiativeForm } from "../../../components/initiative-form";
import { InitiativeCard } from "../../../components/initiative-card";
import { InitiativeFilters } from "../../../components/initiative-filters";
import { currentTermKey } from "@luminova/types";
import { useMembers } from "../../members/hooks/use-members";
import { useActivitiesByTerm } from "../../activities/hooks/use-activities-by-term";
import { useInitiativesByTerm } from "../hooks/use-initiatives-by-term";
import { useCreateInitiative } from "../hooks/use-create-initiative";
import { INITIATIVE_TYPE } from "../lib/initiative-kind";
import { computeProgress, isClosingSoon } from "../lib/derive";
import { filterInitiatives, tabCounts, type InitiativeFilter } from "../lib/filter";

type Editing = { mode: "new"; kind: "Program" | "Project" } | null;

function sheetTitle(editing: Editing): string {
  if (!editing) return "";
  const noun = editing.kind === "Program" ? "programa" : "proyecto";
  return `Nuevo ${noun}`;
}

export function InitiativesPage() {
  const termId = currentTermKey();
  const ability = useAbility();
  const canFeature = useCan().canFeatureInitiatives;
  const navigate = useNavigate();
  const canReadProgram = ability.can("read", "Program");
  const canReadProject = ability.can("read", "Project");
  const canManageProgram = ability.can("create", "Program");
  const canManageProject = ability.can("create", "Project");
  const canReadMembers = ability.can("read", "Member");

  const {
    data: items,
    isLoading,
    isError,
  } = useInitiativesByTerm(termId, {
    includePrograms: canReadProgram,
    includeProjects: canReadProject,
  });
  const { data: activities } = useActivitiesByTerm(termId);
  const { data: members } = useMembers({ enabled: canReadMembers });

  const createProgram = useCreateInitiative("program", termId);
  const createProject = useCreateInitiative("project", termId);

  const kindOptions = [
    ...(canManageProject ? [{ value: "Project" as const, label: "Proyecto" }] : []),
    ...(canManageProgram ? [{ value: "Program" as const, label: "Programa" }] : []),
  ];

  const [filter, setFilter] = useState<InitiativeFilter>({
    tab: "todos",
    kind: "all",
    area: "all",
    query: "",
  });
  const [editing, setEditing] = useState<Editing>(null);
  const [errorToast, setErrorToast] = useDismissingToast();

  const memberById = useMemo(
    () => new Map<string, Member>((members ?? []).map((m) => [m.id, m])),
    [members],
  );
  const memberOptions: ComboboxOption[] = useMemo(
    () => (members ?? []).map((m) => ({ value: m.id, label: m.name })),
    [members],
  );

  const counts = useMemo(() => tabCounts(items ?? []), [items]);
  const visible = useMemo(() => filterInitiatives(items ?? [], filter), [items, filter]);

  const cardData = useMemo(() => {
    const now = Date.now();
    const acts = activities ?? [];
    const map = new Map<string, { pct: number; closingSoon: boolean }>();
    for (const item of items ?? []) {
      map.set(item.id, {
        pct: computeProgress(acts, item.kind, item.id).pct,
        closingSoon: isClosingSoon(item, acts, now),
      });
    }
    return map;
  }, [activities, items]);

  const handleSubmit = async (data: InitiativeInput) => {
    if (!editing) return;
    if (!ability.can("create", editing.kind)) return;
    try {
      if (editing.kind === "Program") await createProgram.mutateAsync(data);
      else await createProject.mutateAsync(data);
      setEditing(null);
    } catch {
      setErrorToast("No se pudo crear. Revisa tus permisos e intenta de nuevo.");
    }
  };

  const isSaving = createProgram.isPending || createProject.isPending;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Reconocimiento"
        title="Proyectos"
        actions={
          (canManageProgram || canManageProject) && (
            <Button
              as="button"
              type="button"
              iconLeft={Icon.plus({ s: 18 })}
              onClick={() =>
                setEditing({ mode: "new", kind: canManageProject ? "Project" : "Program" })
              }
            >
              Nuevo
            </Button>
          )
        }
      />

      <InitiativeFilters filter={filter} counts={counts} onChange={setFilter} />

      {isLoading && <p className="text-ink-3">Cargando…</p>}
      {isError && <p className="text-error">No se pudieron cargar los proyectos.</p>}
      {items && visible.length === 0 && (
        <EmptyState
          icon={Icon.briefcase({ s: 40 })}
          title="No hay proyectos que coincidan."
          description="Ajusta los filtros o crea un nuevo proyecto."
        />
      )}
      {visible.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((item) => (
            <InitiativeCard
              key={`${item.kind}-${item.id}`}
              item={item}
              pct={cardData.get(item.id)?.pct ?? 0}
              closingSoon={cardData.get(item.id)?.closingSoon ?? false}
              memberById={memberById}
              onOpen={() =>
                void navigate({
                  to: "/initiatives/$type/$id",
                  params: { type: INITIATIVE_TYPE[item.kind], id: item.id },
                })
              }
            />
          ))}
        </div>
      )}

      <Sheet
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={sheetTitle(editing)}
      >
        {editing !== null && (
          <div className="flex flex-col gap-4">
            {kindOptions.length > 1 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-ui-sm font-medium text-ink-2">Tipo</span>
                <SegmentedControl
                  aria-label="Tipo de iniciativa"
                  options={kindOptions}
                  value={editing.kind}
                  onChange={(kind) => setEditing({ mode: "new", kind })}
                />
              </div>
            )}
            <InitiativeForm
              key="new"
              memberOptions={memberOptions}
              defaultValues={undefined}
              submitLabel="Crear"
              isSaving={isSaving}
              canFeature={canFeature}
              onSubmit={(data) => void handleSubmit(data)}
            />
          </div>
        )}
      </Sheet>
      {errorToast && <Toast message={errorToast} icon={Icon.close({ s: 18 })} />}
    </div>
  );
}
