import { useState } from "react";
import { Badge, Button, Card, Sheet } from "@luminova/ui";
import type { RoleDefinition, RoleDefinitionInput } from "@luminova/types";
import { useRoles } from "../hooks/use-roles";
import { useAddRole, useUpdateRole, useDeleteRole } from "../hooks/use-save-role";
import { RoleEditor } from "./role-editor";

type Editing = RoleDefinition | "new" | null;

/** Admin surface to author custom roles + edit built-in roles' coarse perms.
 *  Mounted under the `/permisos` Admin gate. */
export function RoleManager() {
  const { data: roles, isLoading } = useRoles({ enabled: true });
  const addRole = useAddRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();
  const [editing, setEditing] = useState<Editing>(null);

  const submit = async (data: RoleDefinitionInput) => {
    if (editing === "new") await addRole.mutateAsync(data);
    else if (editing) await updateRole.mutateAsync({ id: editing.id, data });
    setEditing(null);
  };

  const remove = async () => {
    if (editing && editing !== "new") await deleteRole.mutateAsync(editing.id);
    setEditing(null);
  };

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-ink-1">Roles</h2>
          <p className="text-[13px] text-ink-3">
            Roles predefinidos y personalizados con sus permisos.
          </p>
        </div>
        <Button as="button" onClick={() => setEditing("new")}>
          Crear rol
        </Button>
      </header>

      {isLoading ? (
        <p className="text-ink-3">Cargando roles…</p>
      ) : (
        <Card as="ul" padding="none" className="flex flex-col divide-y divide-line">
          {(roles ?? []).map((role) => (
            <li key={role.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink-1">{role.name}</span>
                  <Badge tone={role.builtIn ? "navy" : "teal"}>
                    {role.builtIn ? "Predefinido" : "Personalizado"}
                  </Badge>
                  {role.locked && <Badge tone="gray">Protegido</Badge>}
                </div>
                <span className="text-[12px] text-ink-3">
                  {role.permissions.length} permiso{role.permissions.length === 1 ? "" : "s"}
                </span>
              </div>
              <Button as="button" variant="secondary" size="sm" onClick={() => setEditing(role)}>
                {role.locked ? "Ver" : "Editar"}
              </Button>
            </li>
          ))}
        </Card>
      )}

      <Sheet
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        size="lg"
        title={editing === "new" ? "Crear rol" : "Editar rol"}
      >
        {editing !== null && (
          <RoleEditor
            key={editing === "new" ? "new" : editing.id}
            role={editing === "new" ? null : editing}
            onSubmit={submit}
            onDelete={editing !== "new" ? remove : undefined}
          />
        )}
      </Sheet>
    </section>
  );
}
