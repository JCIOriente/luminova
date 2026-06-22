import { useMemo, useState } from "react";
import { Badge, Button, MultiSelect } from "@luminova/ui";
import {
  ALL_PERMISSION_CODES,
  PERMISSION_CAP,
  type Member,
  type PermissionCode,
  type Role,
} from "@luminova/types";
import { useRoles } from "../hooks/use-roles";
import { useSaveMemberPermissions } from "../hooks/use-save-member-permissions";
import { previewEffectivePerms } from "../lib/effective-preview";
import { permissionLabel } from "../lib/permission-matrix";

/** Assignable override codes: every action:subject except the meta `:all` / `:Role`. */
const ASSIGNABLE_CODES = ALL_PERMISSION_CODES.filter(
  (c) => !c.endsWith(":all") && !c.endsWith(":Role"),
);
const ASSIGNABLE_SET = new Set<string>(ASSIGNABLE_CODES);
const CODE_OPTIONS = ASSIGNABLE_CODES.map((c) => ({ value: c, label: permissionLabel(c) }));
const assignableOnly = (codes: string[] | undefined): string[] =>
  (codes ?? []).filter((c) => ASSIGNABLE_SET.has(c));

interface MemberRolesPanelProps {
  member: Member;
  /** Built-in role names the member holds via positions (for an accurate preview). */
  builtInRoleNames: Role[];
}

/** Admin-only panel to assign custom roles + per-member permission overrides, with
 *  a live read-only preview of the resulting effective coarse perms. */
export function MemberRolesPanel({ member, builtInRoleNames }: MemberRolesPanelProps) {
  const { data: roles } = useRoles({ enabled: true });
  const save = useSaveMemberPermissions();
  const [saved, setSaved] = useState(false);

  const [roleIds, setRoleIdsState] = useState<string[]>(member.roleIds ?? []);
  // Drop any stray :all / :Role override codes the matrix can't represent, so an
  // edit-and-save can't silently re-persist an unassignable code.
  const [grant, setGrantState] = useState<string[]>(assignableOnly(member.permissionOverrides?.grant));
  const [revoke, setRevokeState] = useState<string[]>(
    assignableOnly(member.permissionOverrides?.revoke),
  );

  // Any edit clears a prior "Guardado." confirmation so it never lingers over
  // unsaved changes.
  const setRoleIds = (v: string[]) => {
    setRoleIdsState(v);
    setSaved(false);
  };
  const setGrant = (v: string[]) => {
    setGrantState(v);
    setSaved(false);
  };
  const setRevoke = (v: string[]) => {
    setRevokeState(v);
    setSaved(false);
  };

  const customRoleOptions = useMemo(
    () => (roles ?? []).filter((r) => !r.builtIn).map((r) => ({ value: r.id, label: r.name })),
    [roles],
  );

  const effective = useMemo(
    () =>
      previewEffectivePerms({
        builtInRoleNames,
        selectedCustomRoleIds: roleIds,
        allRoles: roles ?? [],
        overrides: { grant: grant as PermissionCode[], revoke: revoke as PermissionCode[] },
      }),
    [builtInRoleNames, roleIds, roles, grant, revoke],
  );

  const overCap = effective.length > PERMISSION_CAP;

  const onSave = async () => {
    setSaved(false);
    await save.mutateAsync({
      memberId: member.id,
      roleIds,
      permissionOverrides: { grant: grant as PermissionCode[], revoke: revoke as PermissionCode[] },
    });
    setSaved(true);
  };

  return (
    <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5">
      <div>
        <h2 className="text-[12px] font-medium uppercase tracking-[0.02em] text-ink-3">
          Roles y permisos personalizados
        </h2>
        <p className="text-[12px] text-ink-3">
          Asigna roles personalizados u otorga/revoca permisos puntuales. Los cargos siguen
          confiriendo sus roles automáticamente.
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-ink-2">Roles personalizados</span>
        <MultiSelect
          options={customRoleOptions}
          value={roleIds}
          onChange={setRoleIds}
          placeholder="Sin roles personalizados"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-ink-2">Permisos adicionales (otorgar)</span>
        <MultiSelect options={CODE_OPTIONS} value={grant} onChange={setGrant} placeholder="Ninguno" />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-ink-2">Permisos revocados</span>
        <MultiSelect options={CODE_OPTIONS} value={revoke} onChange={setRevoke} placeholder="Ninguno" />
      </label>

      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-medium uppercase tracking-[0.02em] text-ink-3">
            Permisos efectivos
          </span>
          <span className={`text-[12px] tabular-nums ${overCap ? "text-error" : "text-ink-3"}`}>
            {effective.length}/{PERMISSION_CAP}
          </span>
        </div>
        {effective.length === 0 ? (
          <p className="text-[12px] text-ink-3">Sin permisos efectivos.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {effective.map((code) => (
              <li key={code}>
                <Badge tone="gray">{permissionLabel(code)}</Badge>
              </li>
            ))}
          </ul>
        )}
        {overCap && (
          <p role="alert" className="text-[12px] text-error">
            Excede el máximo de {PERMISSION_CAP} permisos efectivos. Reduce roles u otorgamientos.
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button as="button" onClick={onSave} disabled={overCap || save.isPending}>
          {save.isPending ? "Guardando…" : "Guardar"}
        </Button>
        {saved && !save.isPending && <span className="text-[12px] text-ink-3">Guardado.</span>}
        {save.isError && (
          <span role="alert" className="text-[12px] text-error">
            No se pudo guardar.
          </span>
        )}
      </div>
    </section>
  );
}
