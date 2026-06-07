import { useState, type ReactNode } from "react";
import { Popover } from "@luminova/ui";
import type { Member, MemberStatus } from "@luminova/types";
import { Can } from "../../../lib/authz/ability-context";

interface MemberRowMenuProps {
  member: Member;
  onView: (member: Member) => void;
  onEdit: (member: Member) => void;
  onProvision: (member: Member) => void;
  onSetStatus: (member: Member, status: MemberStatus) => void;
  onDelete: (member: Member) => void;
}

function MenuItem({
  children,
  onSelect,
  danger,
}: {
  children: ReactNode;
  onSelect: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className={
        danger
          ? "w-full rounded-[9px] px-3 py-2 text-left text-[13.5px] font-medium text-error transition-colors hover:bg-error/10"
          : "w-full rounded-[9px] px-3 py-2 text-left text-[13.5px] font-medium text-ink-2 transition-colors hover:bg-ink-1/[0.05] hover:text-ink-1"
      }
    >
      {children}
    </button>
  );
}

export function MemberRowMenu({
  member,
  onView,
  onEdit,
  onProvision,
  onSetStatus,
  onDelete,
}: MemberRowMenuProps) {
  const [open, setOpen] = useState(false);
  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      trigger={
        <button
          type="button"
          aria-label={`Acciones para ${member.name}`}
          aria-haspopup="menu"
          className="grid size-8 place-items-center rounded-[8px] text-ink-2 transition-colors hover:bg-ink-1/[0.04] hover:text-ink-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jci-blue"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="12" cy="5" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="12" cy="19" r="1.6" />
          </svg>
        </button>
      }
      contentClassName="min-w-[208px] p-1.5"
    >
      <div role="menu" className="flex flex-col">
        <Can I="read" a="Member">
          <MenuItem onSelect={run(() => onView(member))}>Ver perfil</MenuItem>
        </Can>
        <Can I="update" a="Member">
          <MenuItem onSelect={run(() => onEdit(member))}>Editar miembro</MenuItem>
        </Can>

        <Can I="manage" a="all">
          <MenuItem onSelect={run(() => onProvision(member))}>
            {member.uid ? "Reenviar invitación" : "Invitar a la app"}
          </MenuItem>
        </Can>

        <Can I="update" a="Member">
          {member.status === "Activo" && (
            <MenuItem onSelect={run(() => onSetStatus(member, "Inactivo"))}>Desactivar</MenuItem>
          )}
          {member.status === "Inactivo" && (
            <MenuItem onSelect={run(() => onSetStatus(member, "Activo"))}>Reactivar</MenuItem>
          )}
          {member.status !== "Desafiliado" && (
            <MenuItem danger onSelect={run(() => onSetStatus(member, "Desafiliado"))}>
              Desafiliar
            </MenuItem>
          )}
        </Can>

        <Can I="delete" a="Member">
          <MenuItem danger onSelect={run(() => onDelete(member))}>
            Eliminar miembro
          </MenuItem>
        </Can>
      </div>
    </Popover>
  );
}
