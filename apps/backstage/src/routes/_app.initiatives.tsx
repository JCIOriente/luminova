import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button, Icon, EmptyState, Menu, MenuItem, Sheet } from "@luminova/ui";
import type { ComboboxOption } from "@luminova/ui";
import type { InitiativeInput, Member } from "@luminova/types";
import { useAbility } from "../lib/authz/ability-context";
import { PageHeader } from "../components/page-header";
import { InitiativeForm } from "../components/initiative-form";
import { InitiativeCard } from "../components/initiative-card";
import { InitiativeFilters } from "../components/initiative-filters";
import { currentTermKey } from "@luminova/types";
import { useMembers } from "../features/members/hooks/use-members";
import { useActivitiesByTerm } from "../features/activities/hooks/use-activities-by-term";
import { useInitiativesByTerm } from "../features/initiatives/hooks/use-initiatives-by-term";
import { useCreateProgram } from "../features/programs/hooks/use-create-program";
import { useCreateProject } from "../features/projects/hooks/use-create-project";
import { computeProgress, isClosingSoon } from "../features/initiatives/lib/derive";
import {
  filterInitiatives,
  tabCounts,
  type InitiativeFilter,
} from "../features/initiatives/lib/filter";

export const Route = createFileRoute("/_app/initiatives")({ component: InitiativesPage });

type Editing = { mode: "new"; kind: "Program" | "Project" } | null;

function sheetTitle(editing: Editing): string {
  if (!editing) return "";
  const noun = editing.kind === "Program" ? "programa" : "proyecto";
  return `Nuevo ${noun}`;
}

function InitiativesPage() {
  const termId = currentTermKey();
  const ability = useAbility();
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

  const createProgram = useCreateProgram(termId);
  const createProject = useCreateProject(termId);

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
        pct: computeProgress(acts, item.kind, item.id).pct,
        closingSoon: isClosingSoon(item, acts, now),
      });
    }
    return map;
  }, [activities, items]);

  const handleSubmit = async (data: InitiativeInput) => {
    if (!editing) return;
    if (!ability.can("create", editing.kind)) return;
    if (editing.kind === "Program") await createProgram.mutateAsync(data);
    else await createProject.mutateAsync(data);
    setEditing(null);
  };

  const isSaving = createProgram.isPending || createProject.isPending;

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
              onOpen={() =>
                void navigate({
                  to: "/initiatives/$type/$id",
                  params: { type: item.kind === "Program" ? "program" : "project", id: item.id },
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
          <InitiativeForm
            key={`new-${editing.kind}`}
            memberOptions={memberOptions}
            defaultValues={undefined}
            submitLabel="Crear"
            isSaving={isSaving}
            onSubmit={(data) => void handleSubmit(data)}
          />
        )}
      </Sheet>
    </div>
  );
}
