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

interface RoleEditorProps {
  role: RoleDefinition | null;
  /** Members who currently hold this role, as counted by /permisos. Labelled
   *  "activos" because that count comes from useMembers() (active only) while the
   *  onRoleWritten fan-out has no active filter — it is not the full blast radius. */
  holderCount?: number;
  onSubmit: (data: RoleDefinitionInput) => Promise<void>;
  /** Deactivate this role (soft, reversible from /permisos). */
  onDelete?: () => Promise<void>;
}

/** Create/edit form for a role: name + description + a subject×action permission
 *  matrix. The locked (Admin) role is fully read-only; every other role allows editing
 *  name/description/permissions (identity fields are immutable server-side).
 *
 *  Deactivation is offered for BUILT-INS too — the beacon three-way makes an inactive
 *  built-in mint nothing instead of restoring its seed perms. Two exclusions: the locked
 *  Admin role (anti-lockout) and `Member`, which computeMemberRoles injects into every
 *  claim unconditionally. Both are also barred in firestore.rules; this is the mirror.
 *  An already-deactivated role offers no deactivate button — its affordance is
 *  "Reactivar rol" in RolesPanel. */
export function RoleEditor({ role, holderCount = 0, onSubmit, onDelete }: RoleEditorProps) {
  const locked = role?.locked ?? false;
  const isMemberRole = role?.builtInKey === "Member";
  const canDelete =
    role !== null && role.active && !locked && !isMemberRole && onDelete !== undefined;
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [perms, setPerms] = useState<Set<PermissionCode>>(new Set(role?.permissions ?? []));
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
    } catch {
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
            /permisos. Afecta a {holderCount}{" "}
            {holderCount === 1 ? "miembro activo" : "miembros activos"}.
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
                .catch(() => setError("No se pudo desactivar el rol."))
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
      {locked && (
        <p className="text-ui-xs text-ink-3">
          El rol Administrador está protegido y no se puede editar.
        </p>
      )}
    </form>
  );
}
