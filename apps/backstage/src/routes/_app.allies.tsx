import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button, Sheet, Dialog, Icon, Toast } from "@luminova/ui";
import { useDismissingToast } from "../lib/use-dismissing-toast";
import { useAllies } from "../features/allies/hooks/use-allies";
import { useAddAlly } from "../features/allies/hooks/use-add-ally";
import { useUpdateAlly } from "../features/allies/hooks/use-update-ally";
import { useDeleteAlly } from "../features/allies/hooks/use-delete-ally";
import { useSetAllyLogo } from "../features/allies/hooks/use-set-ally-logo";
import { useRemoveAllyLogo } from "../features/allies/hooks/use-remove-ally-logo";
import { AllyTable } from "../features/allies/components/ally-table";
import { AllyForm } from "../features/allies/components/ally-form";
import { PageHeader } from "../components/page-header";
import { Can } from "../lib/authz/ability-context";
import type { Ally, AllyInput } from "@luminova/types";

export const Route = createFileRoute("/_app/allies")({
  component: AlliesPage,
});

type Editing = Ally | "new" | null;

function AlliesPage() {
  const { data: allies, isLoading, isError } = useAllies();
  const addAlly = useAddAlly();
  const updateAlly = useUpdateAlly();
  const deleteAlly = useDeleteAlly();
  const setLogo = useSetAllyLogo();
  const removeLogo = useRemoveAllyLogo();

  const [editing, setEditing] = useState<Editing>(null);
  const [deleteTarget, setDeleteTarget] = useState<Ally | null>(null);
  const [errorToast, setErrorToast] = useDismissingToast();

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
    try {
      await deleteAlly.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      setErrorToast("No se pudo eliminar el aliado.");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Gestión"
        title="Aliados"
        subtitle="Empresas y organizaciones que apoyan al capítulo."
        actions={
          <Can I="create" a="Ally">
            <Button
              as="button"
              type="button"
              iconLeft={Icon.plus({ s: 18 })}
              onClick={() => setEditing("new")}
            >
              Agregar aliado
            </Button>
          </Can>
        }
      />

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
        {editing !== null &&
          (() => {
            // Resolve the edited ally from the live query data, not the snapshot taken
            // when the Sheet opened — so the logo preview reflects an upload/removal
            // after invalidateQueries refetches, without closing and reopening.
            const existing =
              editing === "new" ? null : (allies?.find((a) => a.id === editing.id) ?? editing);
            return (
              <AllyForm
                key={existing?.id ?? "new"}
                ally={existing ?? undefined}
                submitLabel={existing ? "Guardar" : "Crear"}
                onSubmit={handleSubmit}
                onUploadLogo={
                  existing ? (file) => setLogo.mutateAsync({ id: existing.id, file }) : undefined
                }
                onRemoveLogo={existing ? () => removeLogo.mutateAsync(existing.id) : undefined}
              />
            );
          })()}
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
      {errorToast && <Toast message={errorToast} icon={Icon.close({ s: 18 })} />}
    </div>
  );
}
