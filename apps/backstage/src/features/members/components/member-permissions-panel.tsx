import { Card } from "@luminova/ui";
import type { Role } from "@luminova/types";
import { roleDisplay } from "../../../lib/role-display";
import { useRoles } from "../../permissions/hooks/use-roles";

export function MemberPermissionsPanel({ roles }: { roles: Role[] }) {
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
          const info = roleDisplay(role, roleDocs);
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
