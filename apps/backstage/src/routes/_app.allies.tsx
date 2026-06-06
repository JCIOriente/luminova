import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button, Sheet, Dialog, Icon } from "@luminova/ui";
import { useAllies } from "../features/allies/hooks/use-allies";
import { useAddAlly } from "../features/allies/hooks/use-add-ally";
import { useUpdateAlly } from "../features/allies/hooks/use-update-ally";
import { useDeleteAlly } from "../features/allies/hooks/use-delete-ally";
import { AllyTable } from "../features/allies/components/ally-table";
import { AllyForm } from "../features/allies/components/ally-form";
import type { Ally } from "../features/allies/types/ally";
import type { AllyInput } from "../features/allies/types/ally-schema";

export const Route = createFileRoute("/_app/allies")({
  component: AlliesPage,
});

type Editing = Ally | "new" | null;

function allyToInput(ally: Ally): Partial<AllyInput> {
  return {
    companyName: ally.companyName,
    personInCharge: ally.personInCharge,
    phone: ally.phone,
    email: ally.email,
  };
}

function AlliesPage() {
  const { data: allies, isLoading, isError } = useAllies();
  const addAlly = useAddAlly();
  const updateAlly = useUpdateAlly();
  const deleteAlly = useDeleteAlly();

  const [editing, setEditing] = useState<Editing>(null);
  const [deleteTarget, setDeleteTarget] = useState<Ally | null>(null);

  const handleSubmit = async (data: AllyInput) => {
    if (editing === "new") {
      await addAlly.mutateAsync(data);
    } else if (editing) {
      await updateAlly.mutateAsync({ id: editing.id, data });
    }
    setEditing(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteAlly.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="mb-2.5 font-mono text-[11px] tracking-[0.14em] text-jci-blue uppercase">
            Gestión
          </div>
          <h1 className="text-[30px] font-normal leading-tight tracking-[-0.02em] text-ink-1">
            Aliados
          </h1>
          <p className="mt-2 text-[14.5px] text-ink-3">
            Empresas y organizaciones que apoyan al capítulo.
          </p>
        </div>
        <Button
          as="button"
          type="button"
          iconLeft={Icon.plus({ s: 18 })}
          onClick={() => setEditing("new")}
        >
          Agregar aliado
        </Button>
      </header>

      {isLoading && <p className="text-ink-2">Cargando…</p>}
      {isError && (
        <p role="alert" className="text-error">
          No se pudieron cargar los aliados.
        </p>
      )}
      {allies && <AllyTable allies={allies} onEdit={setEditing} onDelete={setDeleteTarget} />}

      <Sheet
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        title={editing === "new" ? "Agregar aliado" : "Editar aliado"}
      >
        {editing !== null && (
          <AllyForm
            key={editing === "new" ? "new" : editing.id}
            defaultValues={editing === "new" ? undefined : allyToInput(editing)}
            submitLabel={editing === "new" ? "Crear" : "Guardar"}
            onSubmit={handleSubmit}
          />
        )}
      </Sheet>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Eliminar aliado"
        description={
          deleteTarget
            ? `¿Eliminar a ${deleteTarget.companyName}? Se marcará como inactivo, no se borra definitivamente.`
            : undefined
        }
      >
        <div className="flex justify-end gap-3">
          <Button
            as="button"
            type="button"
            variant="secondary"
            onClick={() => setDeleteTarget(null)}
          >
            Cancelar
          </Button>
          <Button as="button" type="button" onClick={() => void confirmDelete()}>
            Eliminar
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
