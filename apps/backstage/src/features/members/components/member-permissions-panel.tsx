import { Card } from "@luminova/ui";
import type { Role } from "@luminova/types";
import { roleLifecycleDisplay } from "../../../lib/role-display";
import { useRoles } from "../../permissions/hooks/use-roles";

export function MemberPermissionsPanel({ roles }: { roles: Role[] }) {
  // Error deliberately unhandled: roleDisplay degrades to the seed snapshot, which is the
  // right label for every role an admin has not renamed. Blocking this read-only panel on
  // a roles outage would hide the member's cargos entirely — strictly worse than a
  // possibly-stale label. The authoritative surface for role text is /permisos.
  const { data: roleDocs } = useRoles();

  return (
    <Card as="section" aria-labelledby="cargos-asignados-title" className="flex flex-col gap-3">
      <h2
        id="cargos-asignados-title"
        className="text-ui-xs font-medium tracking-[0.02em] text-ink-3 uppercase"
      >
        Cargos asignados
      </h2>
      <p className="text-ui-xs text-ink-3">Permisos que otorga el cargo asignado.</p>
      <ul className="flex flex-col gap-3">
        {roles.map((role) => {
          // roleLifecycleDisplay, not roleDisplay: this list sits under "Permisos que
          // otorga el cargo asignado", so an unmarked deactivated role asserts authority
          // the member does not have.
          const info = roleLifecycleDisplay(role, roleDocs);
          return (
            <li key={role} className="flex flex-col gap-0.5">
              <span className="font-semibold text-ink-1">{info.label}</span>
              <span className="text-ui-sm text-ink-2">{info.description}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
