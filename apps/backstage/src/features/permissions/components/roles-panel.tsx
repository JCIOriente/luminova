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
import { holdersPhrase } from "../lib/holders-phrase";
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

/** The holder count as a FACT or as unknown. `holders` is `[]` both when nobody holds the
 *  role and when the members query never resolved — /permisos reaches the latter on
 *  purpose (it keeps this panel alive through a members outage), so the two must not print
 *  the same. */
function holderCountOrNull(row: RoleOverviewRow, state: SectionState): number | null {
  return state === "ok" ? row.holders.length : null;
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

  const [reactivateError, setReactivateError] = useState<string | null>(null);
  const [reactivateBusy, setReactivateBusy] = useState(false);

  const openReactivate = (row: RoleOverviewRow, doc: RoleDefinition) => {
    setReactivateError(null);
    setReactivating({ row, doc });
  };

  const confirmReactivate = async () => {
    if (!reactivating) return;
    setReactivateError(null);
    setReactivateBusy(true);
    try {
      await reactivateRole.mutateAsync(reactivating.doc.id);
      setReactivating(null);
    } catch (error) {
      // Nothing catches this globally — query-client.ts wires QueryCache only (no
      // MutationCache.onError) and useReactivateRole sets no onError — so without this
      // the rejection was an unhandled promise rejection: no message, dialog stuck open.
      console.error("Failed to reactivate role", error);
      setReactivateError("No se pudo reactivar el rol. Intenta de nuevo.");
    } finally {
      setReactivateBusy(false);
    }
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
                  {/* Deactivation revokes PERMS, never name-keyed authority:
                      computeMemberRoles is pure over positions.grants and reads no role
                      doc, so the `roles` claim keeps the name and every gate keyed on it
                      still fires — canCurateFeatured() (featured on the public site), the
                      Scanner checkIns conjunct, the /positions nav allowlist, the board
                      layout precedence. Only built-ins: computeMemberRoles filters through
                      ROLES, so a custom role's name can never reach a claim. */}
                  {!row.active && row.builtInKey !== null && (
                    <span className="text-ui-xs text-warn">
                      Desactivar no quita los accesos ligados al nombre del rol; para eso, edita los
                      cargos que lo otorgan.
                    </span>
                  )}
                  {!row.active && doc?.locked === true && (
                    <span className="text-ui-xs text-warn">
                      Rol protegido: reactívalo desde la consola de Firebase.
                    </span>
                  )}
                </div>
                {doc !== null && (
                  <div className="flex shrink-0 items-center gap-2">
                    {/* `!doc.locked` too: firestore.rules requires locked == false for ANY
                        roles update, so on a locked doc this write is denied before it
                        reaches roleLifecycleSafe(). Offering it would 403. */}
                    {!row.active && !doc.locked && (
                      <Button
                        as="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => openReactivate(row, doc)}
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
            holderCount={editing === "new" ? 0 : holderCountOrNull(editing.row, holdersState)}
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
          if (!open) {
            setReactivating(null);
            setReactivateError(null);
          }
        }}
        title="Reactivar rol"
        description={
          reactivating
            ? `¿Reactivar ${reactivating.row.label}? Volverá a otorgar estos permisos a ${holdersPhrase(holderCountOrNull(reactivating.row, holdersState))}.`
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
          {reactivateError !== null && (
            <div role="alert" className="text-ui-sm text-error">
              {reactivateError}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <Button
              as="button"
              type="button"
              variant="secondary"
              disabled={reactivateBusy}
              onClick={() => {
                setReactivating(null);
                setReactivateError(null);
              }}
            >
              Cancelar
            </Button>
            {/* Deliberately NOT blocked while `holdersState` is degraded: /permisos keeps
                this panel alive through a members outage precisely so a deactivated role
                stays restorable. Blocking here would make the outage the thing that pins a
                role dead — the bug the per-section degradation exists to avoid. The count
                is labelled unknown instead. */}
            <Button
              as="button"
              type="button"
              disabled={reactivateBusy}
              onClick={() => void confirmReactivate()}
            >
              {reactivateBusy ? "Reactivando…" : "Reactivar"}
            </Button>
          </div>
        </div>
      </Dialog>
    </section>
  );
}
