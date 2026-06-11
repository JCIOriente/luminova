import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button, Icon, EmptyState, Menu, MenuItem, Sheet } from "@luminova/ui";
import type { ComboboxOption } from "@luminova/ui";
import type { InitiativeInput, Member } from "@luminova/types";
import { useAbility } from "../lib/authz/ability-context";
import { PageHeader } from "../components/page-header";
import { InitiativeForm } from "../components/initiative-form";
import { InitiativeCard } from "../components/initiative-card";
import { InitiativeFilters } from "../components/initiative-filters";
import { currentTermId } from "../lib/current-term";
import { useMembers } from "../features/members/hooks/use-members";
import { useActivitiesByTerm } from "../features/activities/hooks/use-activities-by-term";
import { useInitiativesByTerm } from "../features/initiatives/hooks/use-initiatives-by-term";
import { useCreateProgram } from "../features/programs/hooks/use-create-program";
import { useUpdateProgram } from "../features/programs/hooks/use-update-program";
import { useCreateProject } from "../features/projects/hooks/use-create-project";
import { useUpdateProject } from "../features/projects/hooks/use-update-project";
import { initiativeToInput } from "../features/initiatives/repositories/initiative-mapper";
import { computeProgress, isClosingSoon } from "../features/initiatives/lib/derive";
import {
  filterInitiatives,
  tabCounts,
  type InitiativeFilter,
} from "../features/initiatives/lib/filter";
import type { InitiativeListItem } from "../features/initiatives/lib/initiative-list-item";

export const Route = createFileRoute("/_app/initiatives")({ component: InitiativesPage });

type Editing =
  | { mode: "new"; kind: "Program" | "Project" }
  | { mode: "edit"; item: InitiativeListItem }
  | null;

function sheetTitle(editing: Editing): string {
  if (!editing) return "";
  const kind = editing.mode === "new" ? editing.kind : editing.item.kind;
  const noun = kind === "Program" ? "programa" : "proyecto";
  return `${editing.mode === "new" ? "Nuevo" : "Editar"} ${noun}`;
}

function InitiativesPage() {
  const termId = currentTermId();
  const ability = useAbility();
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

  const createProgram = useCreateProgram(termId);
  const updateProgram = useUpdateProgram(termId);
  const createProject = useCreateProject(termId);
  const updateProject = useUpdateProject(termId);

  const [filter, setFilter] = useState<InitiativeFilter>({
    tab: "todos",
    kind: "all",
    area: "all",
    query: "",
  });
  const [editing, setEditing] = useState<Editing>(null);

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
        pct: computeProgress(acts, item.id).pct,
        closingSoon: isClosingSoon(item, acts, now),
      });
    }
    return map;
  }, [activities, items]);

  const handleSubmit = async (data: InitiativeInput) => {
    if (!editing) return;
    if (editing.mode === "new") {
      if (!ability.can("create", editing.kind)) return;
      if (editing.kind === "Program") await createProgram.mutateAsync(data);
      else await createProject.mutateAsync(data);
    } else {
      if (!ability.can("update", editing.item.kind)) return;
      if (editing.item.kind === "Program")
        await updateProgram.mutateAsync({ id: editing.item.id, data });
      else await updateProject.mutateAsync({ id: editing.item.id, data });
    }
    setEditing(null);
  };

  const isSaving =
    createProgram.isPending ||
    updateProgram.isPending ||
    createProject.isPending ||
    updateProject.isPending;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Reconocimiento"
        title="Proyectos"
        actions={
          (canManageProgram || canManageProject) && (
            <Menu
              trigger={
                <Button as="button" type="button" iconLeft={Icon.plus({ s: 18 })}>
                  Nuevo
                </Button>
              }
            >
              {canManageProject && (
                <MenuItem onSelect={() => setEditing({ mode: "new", kind: "Project" })}>
                  Nuevo proyecto
                </MenuItem>
              )}
              {canManageProgram && (
                <MenuItem onSelect={() => setEditing({ mode: "new", kind: "Program" })}>
                  Nuevo programa
                </MenuItem>
              )}
            </Menu>
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
              onOpen={
                ability.can("update", item.kind)
                  ? () => setEditing({ mode: "edit", item })
                  : undefined
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
          <InitiativeForm
            key={editing.mode === "new" ? `new-${editing.kind}` : editing.item.id}
            memberOptions={memberOptions}
            defaultValues={editing.mode === "new" ? undefined : initiativeToInput(editing.item)}
            submitLabel={editing.mode === "new" ? "Crear" : "Guardar"}
            isSaving={isSaving}
            onSubmit={(data) => void handleSubmit(data)}
          />
        )}
      </Sheet>
    </div>
  );
}
