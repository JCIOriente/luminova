import type { Role } from "@luminova/types";
import { PERMISSION_ROLE_INFO } from "../../positions/lib/permission-labels";

export function MemberPermissionsPanel({ roles }: { roles: Role[] }) {
  return (
    <section
      aria-labelledby="cargos-asignados-title"
      className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5"
    >
      <h2
        id="cargos-asignados-title"
        className="text-[12px] font-medium tracking-[0.02em] text-ink-3 uppercase"
      >
        Cargos asignados
      </h2>
      <p className="text-[12px] text-ink-3">
        Permisos que otorga el cargo asignado.
      </p>
      <ul className="flex flex-col gap-3">
        {roles.map((role) => {
          const info = PERMISSION_ROLE_INFO[role];
          return (
            <li key={role} className="flex flex-col gap-0.5">
              <span className="font-semibold text-ink-1">{info.label}</span>
              <span className="text-[13px] text-ink-2">{info.description}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
