import { useState } from "react";
import { Badge, Button, Card, Dialog, Sheet } from "@luminova/ui";
import type { RoleDefinition, RoleDefinitionInput } from "@luminova/types";
import {
  useAddRole,
  useUpdateRole,
  useDeleteRole,
  useReactivateRole,
} from "../hooks/use-save-role";
import { permissionLabel } from "../lib/permission-matrix";
import type { RoleOverviewRow } from "../lib/role-overview";
import { RoleEditor } from "./role-editor";

/** The row AND its doc: the editor needs the doc to write to, and the row to report the
 *  holder count. Carrying only the doc forced an id lookup back into `rows`, which is
 *  ambiguous — an unsynced built-in row and a custom doc can share an id. */
type Editing = { row: RoleOverviewRow; doc: RoleDefinition } | "new" | null;

const MAX_HOLDERS = 5;

/** Per-section availability, so /permisos can degrade `grantingCargos` / `holders`
 *  independently instead of failing the whole page closed. Three states, not two: an
 *  empty list while a query is still in flight must not read as "Nadie aún". */
export type SectionState = "ok" | "loading" | "error";

function stateLabel(state: SectionState): string | null {
  if (state === "loading") return "Cargando…";
  if (state === "error") return "No disponible";
  return null;
}

function holdersLabel(holders: RoleOverviewRow["holders"], state: SectionState): string {
  const degraded = stateLabel(state);
  if (degraded !== null) return degraded;
  if (holders.length === 0) return "Nadie aún";
  const shown = holders
    .slice(0, MAX_HOLDERS)
    .map((holder) => holder.name)
    .join(", ");
  const rest = holders.length - MAX_HOLDERS;
  return rest > 0 ? `${shown} y ${rest} más` : shown;
}

function originLabel(row: RoleOverviewRow, state: SectionState): string {
  // Custom roles are structurally cargo-less, so a positions outage tells us nothing
  // new about them — don't degrade a fact.
  if (row.builtInKey === null) return "Asignación directa";
  const degraded = stateLabel(state);
  if (degraded !== null) return degraded;
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
 *  rather than a blank page that hides which roles are already minting perms.
 *
 *  `cargosState` / `holdersState` let the page degrade those two lines on their own when
 *  the positions or members query is down, instead of failing the whole page — which
 *  would take the only role-restore affordance with it. */
export function RolesPanel({
  rows,
  cargosState = "ok",
  holdersState = "ok",
}: {
  rows: RoleOverviewRow[];
  cargosState?: SectionState;
  holdersState?: SectionState;
}) {
  const addRole = useAddRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();
  const reactivateRole = useReactivateRole();
  const [editing, setEditing] = useState<Editing>(null);
  const [reactivating, setReactivating] = useState<{
    row: RoleOverviewRow;
    doc: RoleDefinition;
  } | null>(null);

  const confirmReactivate = async () => {
    if (reactivating) await reactivateRole.mutateAsync(reactivating.doc.id);
    setReactivating(null);
  };

  const submit = async (data: RoleDefinitionInput) => {
    if (editing === "new") await addRole.mutateAsync(data);
    else if (editing) await updateRole.mutateAsync({ id: editing.doc.id, data });
    setEditing(null);
  };

  const remove = async () => {
    if (editing && editing !== "new") await deleteRole.mutateAsync(editing.doc.id);
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
            // Not `row.id` alone: an unsynced built-in row is keyed by its ROLES key, and a
            // custom doc whose id spells that same unseeded key would collide with it.
            <li
              key={`${row.builtInKey ?? "custom"}:${row.id}`}
              className="flex flex-col gap-3 px-4 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink-1">{row.label}</span>
                    <Badge tone={row.builtInKey !== null ? "navy" : "teal"}>
                      {row.builtInKey !== null ? "Predefinido" : "Personalizado"}
                    </Badge>
                    {doc?.locked && <Badge tone="gray">Protegido</Badge>}
                    {doc === null && <Badge tone="amber">Sin sincronizar</Badge>}
                    {!row.active && <Badge tone="red">Desactivado</Badge>}
                  </div>
                  {row.description && (
                    <span className="text-ui-sm text-ink-3">{row.description}</span>
                  )}
                  <span className="text-ui-xs text-ink-3">
                    {row.permissions.length} permiso
                    {row.permissions.length === 1 ? "" : "s"}
                    {!row.active && " · inactivo — se otorgarán al reactivar"}
                  </span>
                </div>
                {doc !== null && (
                  <div className="flex shrink-0 items-center gap-2">
                    {!row.active && (
                      <Button
                        as="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setReactivating({ row, doc })}
                      >
                        Reactivar rol
                      </Button>
                    )}
                    <Button
                      as="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setEditing({ row, doc })}
                    >
                      {doc.locked ? "Ver" : "Editar"}
                    </Button>
                  </div>
                )}
              </div>
              <dl className="flex flex-col gap-2 text-ui-sm">
                <div className="flex gap-2">
                  <dt className="text-ink-3">Otorgado por:</dt>
                  <dd className="text-ink-2">{originLabel(row, cargosState)}</dd>
                </div>
                <div className="flex gap-2">
                  {/* "Miembros activos", not "Lo tienen": useMembers() filters active
                      members while the onRoleWritten fan-out (index.ts:298) does not, so a
                      soft-deleted member with a surviving Auth user still receives the
                      perms. This count is not the complete blast radius. */}
                  <dt className="text-ink-3">Miembros activos:</dt>
                  <dd className="text-ink-2">{holdersLabel(row.holders, holdersState)}</dd>
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
            key={editing === "new" ? "new" : editing.doc.id}
            role={editing === "new" ? null : editing.doc}
            holderCount={editing === "new" ? 0 : editing.row.holders.length}
            onSubmit={submit}
            onDelete={editing !== "new" ? remove : undefined}
          />
        )}
      </Sheet>

      {/* Reactivation mints the role's whole stored permission set to every holder at
          once, through the unbounded no-retry members scan in onRoleWritten. Show WHAT
          and to WHOM before writing — the confirmation is the last human check. */}
      <Dialog
        open={reactivating !== null}
        onOpenChange={(open) => {
          if (!open) setReactivating(null);
        }}
        title="Reactivar rol"
        description={
          reactivating
            ? `¿Reactivar ${reactivating.row.label}? Volverá a otorgar estos permisos a ${reactivating.row.holders.length} ${reactivating.row.holders.length === 1 ? "miembro activo" : "miembros activos"}.`
            : undefined
        }
      >
        <div className="flex flex-col gap-4">
          {reactivating !== null &&
            (reactivating.row.permissions.length === 0 ? (
              <p className="text-ui-xs text-ink-3">Este rol no otorga ningún permiso.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {reactivating.row.permissions.map((code) => (
                  <li key={code}>
                    <Badge tone="gray">{permissionLabel(code)}</Badge>
                  </li>
                ))}
              </ul>
            ))}
          <div className="flex justify-end gap-3">
            <Button
              as="button"
              type="button"
              variant="secondary"
              onClick={() => setReactivating(null)}
            >
              Cancelar
            </Button>
            <Button as="button" type="button" onClick={() => void confirmReactivate()}>
              Reactivar
            </Button>
          </div>
        </div>
      </Dialog>
    </section>
  );
}
