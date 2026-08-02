import { useState } from "react";
import { Badge, Button, Card, Sheet } from "@luminova/ui";
import type { RoleDefinition, RoleDefinitionInput } from "@luminova/types";
import { useAddRole, useUpdateRole, useDeleteRole } from "../hooks/use-save-role";
import type { RoleOverviewRow } from "../lib/role-overview";
import { RoleEditor } from "./role-editor";

type Editing = RoleDefinition | "new" | null;

const MAX_HOLDERS = 5;

function holdersLabel(holders: RoleOverviewRow["holders"]): string {
  if (holders.length === 0) return "Nadie aún";
  const shown = holders
    .slice(0, MAX_HOLDERS)
    .map((holder) => holder.name)
    .join(", ");
  const rest = holders.length - MAX_HOLDERS;
  return rest > 0 ? `${shown} y ${rest} más` : shown;
}

function originLabel(row: RoleOverviewRow): string {
  if (row.builtInKey === null) return "Asignación directa";
  return row.grantingCargos.length > 0 ? row.grantingCargos.join(", ") : "Ningún cargo lo otorga";
}

/** The single `/permisos` role list: one row per role, showing what confers it, who holds
 *  it, and its permission count — plus the create/edit/delete editor. Replaces the old
 *  split between PermisosView (cargo-derived) and RoleManager (role docs), which rendered
 *  the same role under two different names on one screen.
 *
 *  Every display string comes off the row, never off `row.role` — buildRoleOverview has
 *  already resolved it through roleDisplay. No empty state: buildRoleOverview always emits
 *  a row per ROLES key, so the pre-seed condition renders as rows marked "Sin sincronizar"
 *  rather than a blank page that hides which roles are already minting perms. */
export function RolesPanel({ rows }: { rows: RoleOverviewRow[] }) {
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
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-ui-lg font-semibold text-ink-1">Roles</h2>
          <p className="text-ui-sm text-ink-3">
            Roles predefinidos y personalizados con sus permisos.
          </p>
        </div>
        <Button as="button" onClick={() => setEditing("new")}>
          Crear rol
        </Button>
      </header>

      <Card as="ul" padding="none" className="flex flex-col divide-y divide-line">
        {rows.map((row) => {
          const doc = row.role;
          return (
            <li key={row.id} className="flex flex-col gap-3 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink-1">{row.label}</span>
                    <Badge tone={row.builtInKey !== null ? "navy" : "teal"}>
                      {row.builtInKey !== null ? "Predefinido" : "Personalizado"}
                    </Badge>
                    {doc?.locked && <Badge tone="gray">Protegido</Badge>}
                    {doc === null && <Badge tone="amber">Sin sincronizar</Badge>}
                  </div>
                  {row.description && (
                    <span className="text-ui-sm text-ink-3">{row.description}</span>
                  )}
                  <span className="text-ui-xs text-ink-3">
                    {row.permissions.length} permiso
                    {row.permissions.length === 1 ? "" : "s"}
                  </span>
                </div>
                {doc !== null && (
                  <Button as="button" variant="secondary" size="sm" onClick={() => setEditing(doc)}>
                    {doc.locked ? "Ver" : "Editar"}
                  </Button>
                )}
              </div>
              <dl className="flex flex-col gap-2 text-ui-sm">
                <div className="flex gap-2">
                  <dt className="text-ink-3">Otorgado por:</dt>
                  <dd className="text-ink-2">{originLabel(row)}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-ink-3">Lo tienen:</dt>
                  <dd className="text-ink-2">{holdersLabel(row.holders)}</dd>
                </div>
              </dl>
            </li>
          );
        })}
      </Card>

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
