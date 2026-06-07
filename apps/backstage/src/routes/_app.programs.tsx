import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button, Sheet, Dialog, Icon, EmptyState } from "@luminova/ui";
import type { ComboboxOption } from "@luminova/ui";
import type { Program, ProgramInput } from "@luminova/types";
import { Can } from "../lib/authz/ability-context";
import { PageHeader } from "../components/page-header";
import { InitiativeForm } from "../components/initiative-form";
import { InitiativeTable } from "../components/initiative-table";
import { currentTermId } from "../lib/current-term";
import { useAuth } from "../lib/auth/auth";
import { useMembers } from "../features/members/hooks/use-members";
import { useProgramsByTerm } from "../features/programs/hooks/use-programs-by-term";
import { useCreateProgram } from "../features/programs/hooks/use-create-program";
import { useUpdateProgram } from "../features/programs/hooks/use-update-program";
import { useFileProgramReport } from "../features/programs/hooks/use-file-program-report";

export const Route = createFileRoute("/_app/programs")({ component: ProgramsPage });

type Editing = Program | "new" | null;

function programToInput(p: Program): Partial<ProgramInput> {
  return { title: p.title, roster: p.roster, status: p.status };
}

function ProgramsPage() {
  const termId = currentTermId();
  const { user } = useAuth();
  const { data: programs, isLoading, isError } = useProgramsByTerm(termId);
  const { data: members } = useMembers();
  const create = useCreateProgram(termId);
  const update = useUpdateProgram(termId);
  const fileReport = useFileProgramReport(termId);

  const [editing, setEditing] = useState<Editing>(null);
  const [reportTarget, setReportTarget] = useState<Program | null>(null);

  const memberOptions: ComboboxOption[] = useMemo(
    () => (members ?? []).map((m) => ({ value: m.id, label: m.name })),
    [members],
  );
  const memberName = useMemo(() => {
    const byId = new Map((members ?? []).map((m) => [m.id, m.name]));
    return (id: string) => byId.get(id) ?? "—";
  }, [members]);

  const handleSubmit = async (data: ProgramInput) => {
    if (editing === "new") await create.mutateAsync(data);
    else if (editing) await update.mutateAsync({ id: editing.id, data });
    setEditing(null);
  };

  const confirmReport = async () => {
    if (!reportTarget || !user) return;
    await fileReport.mutateAsync({ id: reportTarget.id, uid: user.uid });
    setReportTarget(null);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Reconocimiento"
        title="Programas"
        actions={
          <Can I="create" a="Program">
            <Button
              as="button"
              type="button"
              iconLeft={Icon.plus({ s: 18 })}
              onClick={() => setEditing("new")}
            >
              Nuevo programa
            </Button>
          </Can>
        }
      />
      {isLoading && <p className="text-ink-3">Cargando…</p>}
      {isError && <p className="text-error">No se pudieron cargar los programas.</p>}
      {programs && programs.length === 0 && (
        <EmptyState
          icon={Icon.folder({ s: 40 })}
          title={`No hay programas para ${termId}.`}
          description="Crea un programa para agrupar actividades."
        />
      )}
      {programs && programs.length > 0 && (
        <InitiativeTable
          rows={programs}
          memberName={memberName}
          onEdit={setEditing}
          onFileReport={setReportTarget}
        />
      )}

      <Sheet
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing === "new" ? "Nuevo programa" : "Editar programa"}
      >
        {editing !== null && (
          <InitiativeForm
            key={editing === "new" ? "new" : editing.id}
            memberOptions={memberOptions}
            defaultValues={editing === "new" ? undefined : programToInput(editing)}
            submitLabel={editing === "new" ? "Crear" : "Guardar"}
            isSaving={create.isPending || update.isPending}
            onSubmit={(data) => void handleSubmit(data)}
          />
        )}
      </Sheet>

      <Dialog
        open={reportTarget !== null}
        onOpenChange={(open) => !open && setReportTarget(null)}
        title="Marcar informe final"
        description={
          reportTarget
            ? `¿Marcar el informe final de "${reportTarget.title}"? Confirma los puntos de sus actividades.`
            : undefined
        }
      >
        <div className="flex justify-end gap-3">
          <Button
            as="button"
            type="button"
            variant="secondary"
            onClick={() => setReportTarget(null)}
          >
            Cancelar
          </Button>
          <Button as="button" type="button" onClick={() => void confirmReport()}>
            Marcar
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
