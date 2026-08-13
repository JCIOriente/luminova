import { useState, type FormEvent } from "react";
import {
  Button,
  Card,
  Checkbox,
  Field,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@luminova/ui";
import {
  PERMISSION_CAP,
  ROLE_NAME_MAX_LENGTH,
  roleDefinitionSchema,
  type PermissionCode,
  type RoleDefinition,
  type RoleDefinitionInput,
} from "@luminova/types";
import {
  ACTION_LABELS,
  MATRIX_ACTIONS,
  MATRIX_SUBJECTS,
  SUBJECT_LABELS,
  permissionCode,
} from "../lib/permission-matrix";
import { holdersPhrase } from "../lib/holders-phrase";
import { isLiveRole, isUndeactivatableRole } from "../../../lib/role-lifecycle";

interface RoleEditorProps {
  role: RoleDefinition | null;
  /** Members who currently hold this role, as counted by /permisos. Labelled
   *  "activos" because that count comes from useMembers() (active only) while the
   *  onRoleWritten fan-out has no active filter — it is not the full blast radius.
   *
   *  `null` when the members query did not resolve: /permisos keeps this editor
   *  reachable through a members outage, and 0 there means "unknown", not "nobody".
   *
   *  REQUIRED, not defaulted: a default of 0 renders "Afecta a 0 miembros activos" as a
   *  fact, so a caller that forgets to wire it must not compile. */
  holderCount: number | null;
  onSubmit: (data: RoleDefinitionInput) => Promise<void>;
  /** Deactivate this role (soft, reversible from /permisos). */
  onDelete?: () => Promise<void>;
}

/** Create/edit form for a role: name + description + a subject×action permission
 *  matrix. The locked (Admin) role is fully read-only; every other role allows editing
 *  name/description/permissions (identity fields are immutable server-side).
 *
 *  Deactivation is offered for BUILT-INS too — the beacon three-way makes an inactive
 *  built-in mint nothing instead of restoring its seed perms. The exclusions come from
 *  UNDEACTIVATABLE_BUILT_IN_KEYS (`Member`, `Admin`), which mirrors firestore.rules'
 *  roleDeactivationAllowed() key-for-key. Keyed on builtInKey, NOT on `locked`: the rules
 *  clause is independent of `locked` on purpose, so a prod `roles/Admin` whose `locked`
 *  lags the seed would otherwise render "Desactivar rol" for a write the rules deny.
 *  An already-deactivated role offers no deactivate button — its affordance is
 *  "Reactivar rol" in RolesPanel. */
export function RoleEditor({ role, holderCount, onSubmit, onDelete }: RoleEditorProps) {
  const locked = role?.locked ?? false;
  const undeactivatable = role !== null && isUndeactivatableRole(role);
  // Both keys in UNDEACTIVATABLE_BUILT_IN_KEYS get their OWN note: the reasons differ, and
  // "no se puede desactivar" with no reason reads as a bug. The Admin note is shown only
  // when the doc is not locked — a locked doc is fully read-only and says so below.
  const isMemberRole = role?.builtInKey === "Member";
  const isAdminRole = role?.builtInKey === "Admin";
  // isLiveRole, never raw role.active: a console-produced doc with active:true AND a
  // deletedAt is dead to beacon's perms pipeline, so RolesPanel already offers it
  // "Reactivar rol". Reading role.active here rendered both buttons at once.
  const canDelete =
    role !== null && isLiveRole(role) && !locked && !undeactivatable && onDelete !== undefined;
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  // Lazy initialiser: this form re-renders per keystroke and per checkbox across a 30-cell
  // matrix, and the eager form built and discarded a Set on every one of them.
  const [perms, setPerms] = useState<Set<PermissionCode>>(() => new Set(role?.permissions ?? []));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const toggle = (code: PermissionCode) => {
    setPerms((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const parsed = roleDefinitionSchema.safeParse({
      name,
      description,
      permissions: [...perms],
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos.");
      return;
    }
    setSaving(true);
    try {
      await onSubmit(parsed.data);
    } catch (error) {
      // Log AND surface, same as RolesPanel's reactivate path: the message the admin sees
      // cannot distinguish permission-denied from a network failure, and nothing catches
      // this globally (query-client.ts wires QueryCache only, no MutationCache.onError).
      // Swallowing it made a rules regression on the roles write invisible (guardrail #4).
      console.error("Failed to save role", error);
      setError("No se pudo guardar. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <Field label="Nombre" htmlFor="role-name" required>
        <Input
          id="role-name"
          value={name}
          disabled={locked}
          maxLength={ROLE_NAME_MAX_LENGTH}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Descripción" htmlFor="role-description">
        <Input
          id="role-description"
          value={description}
          disabled={locked}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-ui-xs font-medium uppercase tracking-[0.02em] text-ink-3">
            Permisos
          </span>
          <span
            className={`text-ui-xs tabular-nums ${perms.size > PERMISSION_CAP ? "text-error" : "text-ink-3"}`}
          >
            {perms.size}/{PERMISSION_CAP}
          </span>
        </div>
        <Card padding="none" className="overflow-x-auto shadow-none">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recurso</TableHead>
                {MATRIX_ACTIONS.map((action) => (
                  <TableHead key={action} className="text-center">
                    {ACTION_LABELS[action]}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {MATRIX_SUBJECTS.map((subject) => (
                <TableRow key={subject}>
                  <TableCell className="text-ink-1">{SUBJECT_LABELS[subject]}</TableCell>
                  {MATRIX_ACTIONS.map((action) => {
                    const code = permissionCode(action, subject);
                    return (
                      <TableCell key={action} className="text-center">
                        <Checkbox
                          checked={perms.has(code)}
                          disabled={locked}
                          onChange={() => toggle(code)}
                          id={`perm-${code}`}
                        />
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>

      {error && (
        <div role="alert" className="text-ui-sm text-error">
          {error}
        </div>
      )}
      {!locked && (
        <Button as="button" type="submit" disabled={saving} className="mt-1 w-full justify-center">
          {saving ? "Guardando…" : role ? "Guardar" : "Crear rol"}
        </Button>
      )}
      {canDelete && (
        <div className="flex flex-col gap-1.5">
          <p className="text-ui-xs text-ink-3">
            Desactivar es reversible: el rol deja de otorgar permisos y se puede reactivar desde
            /permisos. Afecta a {holdersPhrase(holderCount)}.
          </p>
          <Button
            as="button"
            type="button"
            variant="ghost"
            disabled={saving}
            className="w-full justify-center text-error"
            onClick={() => {
              if (!onDelete) return;
              setSaving(true);
              onDelete()
                .catch((error: unknown) => {
                  console.error("Failed to deactivate role", error);
                  setError("No se pudo desactivar el rol.");
                })
                .finally(() => setSaving(false));
            }}
          >
            Desactivar rol
          </Button>
        </div>
      )}
      {isMemberRole && (
        <p className="text-ui-xs text-ink-3">
          El rol Miembro no se puede desactivar: lo tiene toda la organización. Para quitarle
          autoridad, vacía sus permisos.
        </p>
      )}
      {isAdminRole && !locked && (
        <p className="text-ui-xs text-ink-3">
          El rol Administrador no se puede desactivar: es la protección contra quedarse sin acceso.
          Sus permisos sí se pueden editar.
        </p>
      )}
      {locked && (
        <p className="text-ui-xs text-ink-3">
          El rol Administrador está protegido y no se puede editar.
        </p>
      )}
    </form>
  );
}
