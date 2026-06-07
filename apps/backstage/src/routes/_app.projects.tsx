import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button, Sheet, Dialog, Icon, EmptyState } from "@luminova/ui";
import type { ComboboxOption } from "@luminova/ui";
import type { Project, ProjectInput } from "@luminova/types";
import { Can } from "../lib/authz/ability-context";
import { PageHeader } from "../components/page-header";
import { InitiativeForm } from "../components/initiative-form";
import { InitiativeTable } from "../components/initiative-table";
import { currentTermId } from "../lib/current-term";
import { useAuth } from "../lib/auth/auth";
import { useMembers } from "../features/members/hooks/use-members";
import { useProjectsByTerm } from "../features/projects/hooks/use-projects-by-term";
import { useCreateProject } from "../features/projects/hooks/use-create-project";
import { useUpdateProject } from "../features/projects/hooks/use-update-project";
import { useFileProjectReport } from "../features/projects/hooks/use-file-project-report";

export const Route = createFileRoute("/_app/projects")({ component: ProjectsPage });

type Editing = Project | "new" | null;

function projectToInput(p: Project): Partial<ProjectInput> {
  return { title: p.title, roster: p.roster, status: p.status };
}

function ProjectsPage() {
  const termId = currentTermId();
  const { user } = useAuth();
  const { data: projects, isLoading, isError } = useProjectsByTerm(termId);
  const { data: members } = useMembers();
  const create = useCreateProject(termId);
  const update = useUpdateProject(termId);
  const fileReport = useFileProjectReport(termId);

  const [editing, setEditing] = useState<Editing>(null);
  const [reportTarget, setReportTarget] = useState<Project | null>(null);

  const memberOptions: ComboboxOption[] = useMemo(
    () => (members ?? []).map((m) => ({ value: m.id, label: m.name })),
    [members],
  );
  const memberName = useMemo(() => {
    const byId = new Map((members ?? []).map((m) => [m.id, m.name]));
    return (id: string) => byId.get(id) ?? "—";
  }, [members]);

  const handleSubmit = async (data: ProjectInput) => {
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
        title="Proyectos"
        actions={
          <Can I="create" a="Project">
            <Button
              as="button"
              type="button"
              iconLeft={Icon.plus({ s: 18 })}
              onClick={() => setEditing("new")}
            >
              Nuevo proyecto
            </Button>
          </Can>
        }
      />
      {isLoading && <p className="text-ink-3">Cargando…</p>}
      {isError && <p className="text-error">No se pudieron cargar los proyectos.</p>}
      {projects && projects.length === 0 && (
        <EmptyState
          icon={Icon.briefcase({ s: 40 })}
          title={`No hay proyectos para ${termId}.`}
          description="Crea un proyecto para agrupar actividades."
        />
      )}
      {projects && projects.length > 0 && (
        <InitiativeTable
          rows={projects}
          memberName={memberName}
          onEdit={setEditing}
          onFileReport={setReportTarget}
        />
      )}

      <Sheet
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing === "new" ? "Nuevo proyecto" : "Editar proyecto"}
      >
        {editing !== null && (
          <InitiativeForm
            key={editing === "new" ? "new" : editing.id}
            memberOptions={memberOptions}
            defaultValues={editing === "new" ? undefined : projectToInput(editing)}
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
