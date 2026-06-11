import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button, Dialog, EmptyState, Icon, Sheet, Skeleton, Toast } from "@luminova/ui";
import type { Position, PositionInput } from "@luminova/types";
import { usePositions } from "../features/positions/hooks/use-positions";
import { useAddPosition } from "../features/positions/hooks/use-add-position";
import { useUpdatePosition } from "../features/positions/hooks/use-update-position";
import { useDeletePosition } from "../features/positions/hooks/use-delete-position";
import { useSeedPositions } from "../features/positions/hooks/use-seed-positions";
import { PositionForm } from "../features/positions/components/position-form";
import { PositionSection } from "../features/positions/components/position-table";
import { PageHeader } from "../components/page-header";
import { Can, useAbility } from "../lib/authz/ability-context";

export const Route = createFileRoute("/_app/positions")({
  component: PositionsPage,
});

type Editing = Position | "new" | null;

function positionToInput(position: Position): Partial<PositionInput> {
  return {
    title: position.title,
    titleFemale: position.titleFemale ?? undefined,
    sigla: position.sigla ?? undefined,
    category: position.category,
    grants: position.grants,
    term: position.term,
    description: position.description,
  };
}

function PositionsPage() {
  const { data: positions, isLoading, isError } = usePositions();
  const addPosition = useAddPosition();
  const updatePosition = useUpdatePosition();
  const deletePosition = useDeletePosition();
  const seedPositions = useSeedPositions();
  const ability = useAbility();
  const isAdmin = ability.can("manage", "all");

  const [editing, setEditing] = useState<Editing>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Position | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(id);
  }, [toast]);

  const handleSubmit = async (data: PositionInput) => {
    if (editing === "new") {
      await addPosition.mutateAsync(data);
      setToast(`Se creó el cargo ${data.title}.`);
    } else if (editing) {
      await updatePosition.mutateAsync({ id: editing.id, data });
      setToast(`Se guardaron los cambios de ${data.title}.`);
    }
    setEditing(null);
  };

  const confirmDeactivate = async () => {
    if (!deactivateTarget) return;
    try {
      await deletePosition.mutateAsync(deactivateTarget.id);
      setToast(`Se desactivó el cargo ${deactivateTarget.title}.`);
    } catch {
      setToast("No se pudo desactivar el cargo.");
    }
    setDeactivateTarget(null);
  };

  const handleSeed = async () => {
    try {
      await seedPositions.mutateAsync();
      setToast("Se crearon los cargos del CEL.");
    } catch {
      setToast("No se pudieron crear los cargos del CEL.");
    }
  };

  const all = positions ?? [];
  const activePositions = all.filter((p) => p.active);
  const cel = activePositions.filter((p) => p.category === "CEL");
  const jdl = activePositions.filter((p) => p.category === "JDL");
  const comisiones = activePositions.filter((p) => p.category === "Comision");
  const seedable = all.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Gestión"
        title="Cargos y comisiones"
        subtitle="Catálogo de cargos del CEL, direcciones JDL y comisiones del capítulo."
        actions={
          <Can I="create" a="Position">
            <Button
              as="button"
              type="button"
              iconLeft={Icon.plus({ s: 18 })}
              onClick={() => setEditing("new")}
            >
              Nuevo cargo
            </Button>
          </Can>
        }
      />

      {isLoading && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      )}
      {isError && (
        <p role="alert" className="text-error">
          No se pudieron cargar los cargos.
        </p>
      )}
      {positions && seedable && (
        <EmptyState
          icon={Icon.compass({ s: 40 })}
          title="El catálogo está vacío"
          description="Aún no hay cargos ni comisiones registrados."
          action={
            isAdmin ? (
              <Button
                as="button"
                type="button"
                disabled={seedPositions.isPending}
                onClick={() => void handleSeed()}
              >
                {seedPositions.isPending ? "Creando…" : "Crear cargos CEL"}
              </Button>
            ) : undefined
          }
        />
      )}
      {positions && !seedable && (
        <div className="flex flex-col gap-8">
          <PositionSection
            title="Cargos"
            variant="cargo"
            positions={cel}
            onEdit={setEditing}
            onDeactivate={setDeactivateTarget}
          />
          <PositionSection
            title="Direcciones"
            variant="cargo"
            positions={jdl}
            onEdit={setEditing}
            onDeactivate={setDeactivateTarget}
          />
          <PositionSection
            title="Comisiones"
            variant="comision"
            positions={comisiones}
            onEdit={setEditing}
            onDeactivate={setDeactivateTarget}
          />
        </div>
      )}

      <Sheet
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        title={editing === "new" ? "Nuevo cargo" : "Editar cargo"}
        size="md"
      >
        {editing !== null && (
          <PositionForm
            key={editing === "new" ? "new" : editing.id}
            defaultValues={editing === "new" ? undefined : positionToInput(editing)}
            submitLabel={editing === "new" ? "Crear" : "Guardar"}
            canEditGrants={isAdmin}
            onSubmit={handleSubmit}
          />
        )}
      </Sheet>

      <Dialog
        open={deactivateTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeactivateTarget(null);
        }}
        title="Desactivar cargo"
        description={
          deactivateTarget
            ? `¿Desactivar ${deactivateTarget.title}? Saldrá del catálogo, pero las asignaciones históricas se conservan.`
            : undefined
        }
      >
        <div className="flex justify-end gap-3">
          <Button
            as="button"
            type="button"
            variant="secondary"
            onClick={() => setDeactivateTarget(null)}
          >
            Cancelar
          </Button>
          <Button as="button" type="button" onClick={() => void confirmDeactivate()}>
            Desactivar
          </Button>
        </div>
      </Dialog>

      {toast && <Toast message={toast} icon={Icon.check({ s: 18 })} />}
    </div>
  );
}
