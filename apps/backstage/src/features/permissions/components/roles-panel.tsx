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

/** The DOC ID of the row being edited, never a copy of the row. An overlay that carried a
 *  snapshot kept asserting pre-refetch facts — the permission set and the holder count —
 *  while a background refetch of roles/members/positions moved `rows` underneath it, and
 *  those two facts are the whole reason the confirmation exists before a write that fans
 *  out to the entire members collection.
 *
 *  Keying by DOC id, not `row.id`, answers the ambiguity that argued against an id lookup:
 *  `row.id` falls back to the ROLES key when a built-in has no doc, so an unsynced row and
 *  a custom doc can share it. Both overlays require a doc to write to, so both can match on
 *  `row.role.id` — unique across `rows`, since the seeded rows come one per role doc. */
type Editing = { docId: string } | "new" | null;

/** The live row for an open overlay, or null once its row leaves the list — in which case
 *  the overlay closes. Correct: there is no longer a target to state facts about. */
function findByDocId(
  rows: RoleOverviewRow[],
  docId: string,
): { row: RoleOverviewRow; doc: RoleDefinition } | null {
  for (const row of rows) {
    if (row.role !== null && row.role.id === docId) return { row, doc: row.role };
  }
  return null;
}

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
 *  `cargosState` / `holdersState` are REQUIRED, not defaulted. "ok" is exactly the value
 *  that makes an empty holder list render as an authoritative "Nadie aún" and a 0 count
 *  read as fact, so a future page that forgets to wire them must be a compile error, not a
 *  silently wrong authorization picture. */
export function RolesPanel({
  rows,
  cargosState,
  holdersState,
}: {
  rows: RoleOverviewRow[];
  cargosState: SectionState;
  holdersState: SectionState;
}) {
  const addRole = useAddRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();
  const reactivateRole = useReactivateRole();
  const [editing, setEditing] = useState<Editing>(null);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);

  const [reactivateError, setReactivateError] = useState<string | null>(null);
  const [reactivateBusy, setReactivateBusy] = useState(false);

  // Derived during render, so both overlays always show the latest refetched row.
  const editingTarget =
    editing === null || editing === "new" ? null : findByDocId(rows, editing.docId);
  const reactivating = reactivatingId === null ? null : findByDocId(rows, reactivatingId);

  const openReactivate = (doc: RoleDefinition) => {
    setReactivateError(null);
    setReactivatingId(doc.id);
  };

  const confirmReactivate = async () => {
    if (!reactivating) return;
    setReactivateError(null);
    setReactivateBusy(true);
    try {
      await reactivateRole.mutateAsync(reactivating.doc.id);
      setReactivatingId(null);
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
    else if (editing) await updateRole.mutateAsync({ id: editing.docId, data });
    setEditing(null);
  };

  const remove = async () => {
    if (editing && editing !== "new") await deleteRole.mutateAsync(editing.docId);
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
                        onClick={() => openReactivate(doc)}
                      >
                        Reactivar rol
                      </Button>
                    )}
                    <Button
                      as="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setEditing({ docId: doc.id })}
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
        open={editing === "new" || editingTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        size="lg"
        // "Ver rol" on the locked doc: its trigger reads "Ver" and its form is entirely
        // read-only, so "Editar rol" promised an edit the rules deny.
        title={
          editing === "new"
            ? "Crear rol"
            : editingTarget?.doc.locked === true
              ? "Ver rol"
              : "Editar rol"
        }
      >
        {editing === "new" ? (
          <RoleEditor
            key="new"
            role={null}
            holderCount={0}
            onSubmit={submit}
            onDelete={undefined}
          />
        ) : (
          editingTarget !== null && (
            <RoleEditor
              key={editingTarget.doc.id}
              role={editingTarget.doc}
              holderCount={holderCountOrNull(editingTarget.row, holdersState)}
              onSubmit={submit}
              onDelete={remove}
            />
          )
        )}
      </Sheet>

      {/* Reactivation mints the role's whole stored permission set to every holder at
          once, through the unbounded no-retry members scan in onRoleWritten. Show WHAT
          and to WHOM before writing — the confirmation is the last human check. */}
      <Dialog
        open={reactivating !== null}
        onOpenChange={(open) => {
          if (!open) {
            setReactivatingId(null);
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
                setReactivatingId(null);
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
