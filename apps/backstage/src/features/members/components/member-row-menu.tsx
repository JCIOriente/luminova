import { Menu, MenuItem, MenuSeparator } from "@luminova/ui";
import type { Member, MemberStatus } from "@luminova/types";
import { Can } from "../../../lib/authz/ability-context";
import { ActionGate } from "../../../lib/authz/action-gate";

interface MemberRowMenuProps {
  member: Member;
  onView: (member: Member) => void;
  onEdit: (member: Member) => void;
  onProvision: (member: Member) => void;
  onSetStatus: (member: Member, status: MemberStatus) => void;
  onUnpublish: (member: Member) => void;
}

export function MemberRowMenu({
  member,
  onView,
  onEdit,
  onProvision,
  onSetStatus,
  onUnpublish,
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
      {/* Collection-level gates (no `on`): these act on ANOTHER member's doc, so the
          own-doc conditional grant every member carries must not open them. */}
      <Can I="read" a="Member">
        <MenuItem onSelect={() => onView(member)}>Ver perfil</MenuItem>
      </Can>
      <Can I="update" a="Member">
        <MenuItem onSelect={() => onEdit(member)}>Editar miembro</MenuItem>
      </Can>

      {/* provisionMemberLogin is requireAdmin (role), not the manage:all perm. */}
      <ActionGate role={["Admin"]}>
        <MenuItem onSelect={() => onProvision(member)}>
          {member.uid ? "Reenviar invitación" : "Invitar a la app"}
        </MenuItem>
      </ActionGate>

      {/* Takedown, Admin-role only — mirrors the rules arm that lets an Admin force
          publicProfile to false and nothing else. Shown only when the member is actually
          published, since the arm can only ever turn publication OFF. This is the only
          path to un-publish someone who can no longer reach /me. */}
      <ActionGate role={["Admin"]}>
        {member.publicProfile === true && (
          <MenuItem onSelect={() => onUnpublish(member)}>Quitar del sitio público</MenuItem>
        )}
      </ActionGate>

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
