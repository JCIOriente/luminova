import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button, Sheet, Dialog, Icon } from "@luminova/ui";
import { useMembers } from "../features/members/hooks/use-members";
import { useAddMember } from "../features/members/hooks/use-add-member";
import { useUpdateMember } from "../features/members/hooks/use-update-member";
import { useDeleteMember } from "../features/members/hooks/use-delete-member";
import { MemberTable } from "../features/members/components/member-table";
import { MemberForm } from "../features/members/components/member-form";
import { PageHeader } from "../components/page-header";
import { dateInputValue } from "../features/members/repositories/member-mapper";
import type { Member } from "../features/members/types/member";
import type { MemberInput } from "../features/members/types/member-schema";

export const Route = createFileRoute("/_app/members")({
  component: MembersPage,
});

type Editing = Member | "new" | null;

function memberToInput(member: Member): Partial<MemberInput> {
  return {
    name: member.name,
    email: member.email,
    phone: member.phone ?? "",
    role: member.role,
    profession: member.profession ?? "",
    joinDate: member.joinDate ? dateInputValue(member.joinDate) : "",
    birthdate: member.birthdate ? dateInputValue(member.birthdate) : "",
    status: member.status ?? "Activo",
  };
}

function MembersPage() {
  const { data: members, isLoading, isError } = useMembers();
  const addMember = useAddMember();
  const updateMember = useUpdateMember();
  const deleteMember = useDeleteMember();

  const [editing, setEditing] = useState<Editing>(null);
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null);

  const handleSubmit = async (data: MemberInput) => {
    if (editing === "new") {
      await addMember.mutateAsync(data);
    } else if (editing) {
      await updateMember.mutateAsync({ id: editing.id, data });
    }
    setEditing(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteMember.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Gestión"
        title="Miembros"
        subtitle="Gestiona la membresía activa del capítulo, roles y estados."
        actions={
          <Button
            as="button"
            type="button"
            iconLeft={Icon.plus({ s: 18 })}
            onClick={() => setEditing("new")}
          >
            Agregar miembro
          </Button>
        }
      />

      {isLoading && <p className="text-ink-2">Cargando…</p>}
      {isError && (
        <p role="alert" className="text-error">
          No se pudieron cargar los miembros.
        </p>
      )}
      {members && <MemberTable members={members} onEdit={setEditing} onDelete={setDeleteTarget} />}

      <Sheet
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        title={editing === "new" ? "Agregar miembro" : "Editar miembro"}
      >
        {editing !== null && (
          <MemberForm
            key={editing === "new" ? "new" : editing.id}
            defaultValues={editing === "new" ? undefined : memberToInput(editing)}
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
        title="Eliminar miembro"
        description={
          deleteTarget
            ? `¿Eliminar a ${deleteTarget.name}? Se marcará como inactivo, no se borra definitivamente.`
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
