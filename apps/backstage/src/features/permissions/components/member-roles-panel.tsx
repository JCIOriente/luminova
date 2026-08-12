import { useMemo, useState } from "react";
import { Badge, Button, Card, MultiSelect } from "@luminova/ui";
import {
  ALL_PERMISSION_CODES,
  PERMISSION_CAP,
  type Member,
  type PermissionCode,
  type Role,
} from "@luminova/types";
import { assignableRoles, isLiveRole } from "../../../lib/role-lifecycle";
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
  const [grant, setGrantState] = useState<string[]>(
    assignableOnly(member.permissionOverrides?.grant),
  );
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

  // Both derivations in ONE memo so their predicates sit side by side: they disagree on
  // `builtIn` on purpose, and split across two memos that asymmetry drifts unnoticed.
  //   - OPTIONS are live AND custom-only: a built-in is conferred by a cargo's grants.
  //   - The NOTICE covers built-ins too. A deactivated built-in doc id CAN sit in
  //     members.roleIds (beacon's getRolesByIds resolves a built-in doc id, so that path
  //     really did mint its perms), and it gets no chip on either field. Filtering it out
  //     of the notice as well would make a stored grant invisible on every surface — the
  //     opposite of what the notice is for. Filed under the custom-roles field because
  //     that is where roleIds is edited.
  // Neither drops anything from state: the assignment is real and returns the moment the
  // role is reactivated.
  const { customRoleOptions, inactiveAssigned } = useMemo(() => {
    const all = roles ?? [];
    return {
      customRoleOptions: assignableRoles(all)
        .filter((r) => !r.builtIn)
        .map((r) => ({ value: r.id, label: r.name })),
      inactiveAssigned: all.filter((r) => roleIds.includes(r.id) && !isLiveRole(r)),
    };
  }, [roles, roleIds]);

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
    <Card as="section" className="flex flex-col gap-4">
      <div>
        <h2 className="text-ui-xs font-medium uppercase tracking-[0.02em] text-ink-3">
          Roles y permisos personalizados
        </h2>
        <p className="text-ui-xs text-ink-3">
          Asigna roles personalizados u otorga/revoca permisos puntuales. Los cargos siguen
          confiriendo sus roles automáticamente.
        </p>
      </div>

      {/* The notice is a SIBLING of the label, never a child. A `button` is a labelable
          element, so MultiSelect's trigger takes its accessible name from the whole text
          content of a wrapping <label> — with the notice inside, the field announced
          itself as "Roles personalizados Coordinador Retirado está desactivado: …".
          `role="status"` (polite), not `role="alert"`: this advisory is persistent and
          already true at mount, so an assertive interruption is wrong. It is not wired
          via aria-describedby because MultiSelect exposes no describedby prop and
          packages/ui is outside this change. */}
      <div className="flex flex-col gap-1.5">
        <label className="flex flex-col gap-1.5">
          <span className="text-ui-sm font-medium text-ink-2">Roles personalizados</span>
          <MultiSelect
            options={customRoleOptions}
            value={roleIds}
            onChange={setRoleIds}
            placeholder="Sin roles personalizados"
          />
        </label>
        {inactiveAssigned.length > 0 && (
          <p role="status" className="flex flex-wrap items-center gap-1.5 text-ui-xs text-ink-3">
            {inactiveAssigned.map((r) => (
              <Badge key={r.id} tone="amber">
                {r.name}
              </Badge>
            ))}
            {inactiveAssigned.length === 1
              ? "está desactivado: sigue asignado pero no otorga permisos hasta reactivarlo en /permisos."
              : "están desactivados: siguen asignados pero no otorgan permisos hasta reactivarlos en /permisos."}
          </p>
        )}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-ui-sm font-medium text-ink-2">Permisos adicionales (otorgar)</span>
        <MultiSelect
          options={CODE_OPTIONS}
          value={grant}
          onChange={setGrant}
          placeholder="Ninguno"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-ui-sm font-medium text-ink-2">Permisos revocados</span>
        <MultiSelect
          options={CODE_OPTIONS}
          value={revoke}
          onChange={setRevoke}
          placeholder="Ninguno"
        />
      </label>

      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <div className="flex items-center justify-between">
          <span className="text-ui-xs font-medium uppercase tracking-[0.02em] text-ink-3">
            Permisos efectivos
          </span>
          <span className={`text-ui-xs tabular-nums ${overCap ? "text-error" : "text-ink-3"}`}>
            {effective.length}/{PERMISSION_CAP}
          </span>
        </div>
        {effective.length === 0 ? (
          <p className="text-ui-xs text-ink-3">Sin permisos efectivos.</p>
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
          <p role="alert" className="text-ui-xs text-error">
            Excede el máximo de {PERMISSION_CAP} permisos efectivos. Reduce roles u otorgamientos.
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button as="button" onClick={onSave} disabled={overCap || save.isPending}>
          {save.isPending ? "Guardando…" : "Guardar"}
        </Button>
        {saved && !save.isPending && <span className="text-ui-xs text-ink-3">Guardado.</span>}
        {save.isError && (
          <span role="alert" className="text-ui-xs text-error">
            No se pudo guardar.
          </span>
        )}
      </div>
    </Card>
  );
}
