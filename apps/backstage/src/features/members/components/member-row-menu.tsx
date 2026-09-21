import { Menu, MenuItem, MenuSeparator } from "@luminova/ui";
import type { Member, MemberStatus, Position } from "@luminova/types";
import { Can } from "../../../lib/authz/ability-context";
import { ActionGate } from "../../../lib/authz/action-gate";
import { useCan } from "../../../lib/authz/use-can";
import { memberProvisionBlocked } from "../lib/provision-gate";
import { inviteActionLabel, memberInviteState } from "../lib/invite-state";

interface MemberRowMenuProps {
  member: Member;
  positionsById: ReadonlyMap<string, Position>;
  onView: (member: Member) => void;
  onEdit: (member: Member) => void;
  onProvision: (member: Member) => void;
  onSetStatus: (member: Member, status: MemberStatus) => void;
  onUnpublish: (member: Member) => void;
}

export function MemberRowMenu({
  member,
  positionsById,
  onView,
  onEdit,
  onProvision,
  onSetStatus,
  onUnpublish,
}: MemberRowMenuProps) {
  const { canProvisionLogin, isAdmin } = useCan();
  const provisionBlocked = memberProvisionBlocked(member, (id) => positionsById.get(id), isAdmin);
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

      {/* issueMemberInvite is requireAdminOrPerm(create:MemberLogin) — the Admin role or that
          exact code, never the manage:all perm. memberProvisionBlocked mirrors the refusals
          the callable applies to a non-Admin that a CLIENT CAN SEE (direct grants, a
          power-granting cargo in any term). It no longer mirrors "already has a login": after
          D3 that is the RECOVERY branch, not a refusal, and since this gate is a MOUNT gate —
          the item does not render at all — keeping it would have meant beacon allowing
          recovery while the menu never offered it.
          Three refusals stay invisible here (adoption, self-heal, a privileged Auth account):
          each needs Auth-directory state no client can read, so they 403 with a tagged reason
          that provisionErrorMessage names. */}
      <ActionGate when={canProvisionLogin && !provisionBlocked}>
        <MenuItem onSelect={() => onProvision(member)}>
          {/* Derived, not hand-typed: this menu used to say "Reenviar invitación" / "Invitar a
              la app" while the profile header said something else for the same action. */}
          {inviteActionLabel(memberInviteState(member, Date.now()))}
        </MenuItem>
      </ActionGate>

      {/* Takedown, Admin-role only — mirrors the rules arm that lets an Admin force
          publicProfile to false and nothing else. Shown only when the member is actually
          published, since the arm can only ever turn publication OFF. This is the only
          path to un-publish someone who can no longer reach /me. */}
      <ActionGate role={["Admin"]} when={member.publicProfile === true}>
        {/* "Revocar el permiso", not "quitar del sitio": publicProfile defaults on, so
            most members carry it while not actually being on the board page (that also
            needs a cargo + portrait). The action revokes the flag either way. */}
        <MenuItem onSelect={() => onUnpublish(member)}>Revocar perfil público</MenuItem>
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
