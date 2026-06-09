import { Menu, MenuItem, MenuSeparator } from "@luminova/ui";
import type { Member, MemberStatus } from "@luminova/types";
import { Can } from "../../../lib/authz/ability-context";

interface MemberRowMenuProps {
  member: Member;
  onView: (member: Member) => void;
  onEdit: (member: Member) => void;
  onProvision: (member: Member) => void;
  onSetStatus: (member: Member, status: MemberStatus) => void;
}

export function MemberRowMenu({
  member,
  onView,
  onEdit,
  onProvision,
  onSetStatus,
}: MemberRowMenuProps) {
  return (
    <Menu
      align="end"
      trigger={
        <button
          type="button"
          aria-label={`Acciones para ${member.name}`}
          className="grid size-8 place-items-center rounded-[8px] text-ink-2 transition-colors hover:bg-ink-1/[0.04] hover:text-ink-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jci-blue"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="12" cy="5" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="12" cy="19" r="1.6" />
          </svg>
        </button>
      }
    >
      <Can I="read" a="Member">
        <MenuItem onSelect={() => onView(member)}>Ver perfil</MenuItem>
      </Can>
      <Can I="update" a="Member">
        <MenuItem onSelect={() => onEdit(member)}>Editar miembro</MenuItem>
      </Can>

      <Can I="manage" a="all">
        <MenuItem onSelect={() => onProvision(member)}>
          {member.uid ? "Reenviar invitación" : "Invitar a la app"}
        </MenuItem>
      </Can>

      <Can I="update" a="Member">
        <MenuSeparator />
        {member.status === "Activo" && (
          <MenuItem onSelect={() => onSetStatus(member, "Inactivo")}>Desactivar</MenuItem>
        )}
        {member.status === "Inactivo" && (
          <MenuItem onSelect={() => onSetStatus(member, "Activo")}>Reactivar</MenuItem>
        )}
        {member.status !== "Desafiliado" && (
          <MenuItem danger onSelect={() => onSetStatus(member, "Desafiliado")}>
            Desafiliar
          </MenuItem>
        )}
      </Can>
    </Menu>
  );
}
