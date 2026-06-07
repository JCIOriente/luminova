import { Link } from "@tanstack/react-router";
import { Badge, Button, Sheet, type BadgeTone } from "@luminova/ui";
import type { Member, MemberInput, MemberStatus } from "@luminova/types";
import { MemberForm } from "./member-form";
import { dateInputValue } from "../repositories/member-mapper";
import { avatarColor, joinYear } from "../lib/member-display";
import { initials } from "../../../lib/initials";
import { Can } from "../../../lib/authz/ability-context";

interface MemberDrawerProps {
  open: boolean;
  mode: "view" | "edit";
  member: Member | null;
  onClose: () => void;
  onEditMode: () => void;
  onSubmit: (data: MemberInput) => Promise<void>;
}

const STATUS_TONE: Record<MemberStatus, BadgeTone> = {
  Activo: "green",
  Inactivo: "gray",
  Desafiliado: "red",
};

function toFormInput(member: Member): Partial<MemberInput> {
  return {
    name: member.name,
    email: member.email,
    phone: member.phone ?? "",
    role: member.role,
    profession: member.profession ?? "",
    joinDate: member.joinDate ? dateInputValue(member.joinDate) : "",
    birthdate: member.birthdate ? dateInputValue(member.birthdate) : "",
    status: member.status,
  };
}

function Detail({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[12px] font-medium tracking-[0.02em] text-ink-3 uppercase">{label}</dt>
      <dd className="text-[15px] text-ink-1">{value}</dd>
    </div>
  );
}

function ViewBody({ member, onEditMode }: { member: Member; onEditMode: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <span
          className="flex size-14 shrink-0 items-center justify-center rounded-full text-[18px] font-semibold text-white"
          style={{ backgroundColor: avatarColor(member.id) }}
        >
          {initials(member.name)}
        </span>
        <div className="min-w-0">
          <div className="truncate text-[18px] font-semibold text-ink-1">{member.name}</div>
          <Badge tone={STATUS_TONE[member.status]} dot={member.status === "Activo"}>
            {member.status}
          </Badge>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
        <Detail label="Correo" value={member.email} />
        <Detail label="Rol" value={member.role} />
        <Detail label="Miembro desde" value={member.joinDate ? joinYear(member.joinDate) : "—"} />
        <Detail label="Puntos" value={member.totalPoints ?? 0} />
      </dl>

      <div className="mt-2 flex flex-col gap-3">
        <Can I="update" a="Member">
          <Button as="button" type="button" onClick={onEditMode} className="w-full justify-center">
            Editar perfil
          </Button>
        </Can>
        <Link
          to="/members/$memberId"
          params={{ memberId: member.id }}
          className="text-center text-[14px] font-semibold text-jci-blue transition-colors hover:text-jci-navy"
        >
          Ver perfil completo
        </Link>
      </div>
    </div>
  );
}

export function MemberDrawer({
  open,
  mode,
  member,
  onClose,
  onEditMode,
  onSubmit,
}: MemberDrawerProps) {
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={mode === "view" ? "Perfil del miembro" : "Editar miembro"}
    >
      {member &&
        (mode === "view" ? (
          <ViewBody member={member} onEditMode={onEditMode} />
        ) : (
          <MemberForm
            key={member.id}
            showPreview
            defaultValues={toFormInput(member)}
            submitLabel="Guardar"
            onSubmit={onSubmit}
          />
        ))}
    </Sheet>
  );
}
