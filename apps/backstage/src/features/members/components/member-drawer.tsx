import { Link } from "@tanstack/react-router";
import { Avatar, Badge, Button, ImageUploader, Sheet, type BadgeTone } from "@luminova/ui";
import {
  currentTermKey,
  positionTitle,
  type Member,
  type MemberInput,
  type MemberStatus,
  type Position,
} from "@luminova/types";
import { MemberForm } from "./member-form";
import { joinYear, memberPositionLabel } from "../lib/member-display";
import { memberFormDefaults } from "../lib/member-form-defaults";
import { useMemberPhoto } from "../hooks/use-member-photo";
import { Can } from "../../../lib/authz/ability-context";
import { useCan } from "../../../lib/authz/use-can";

interface MemberDrawerProps {
  open: boolean;
  mode: "view" | "edit";
  member: Member | null;
  positions: Position[];
  onClose: () => void;
  onEditMode: () => void;
  onSubmit: (data: MemberInput) => Promise<void>;
}

const STATUS_TONE: Record<MemberStatus, BadgeTone> = {
  Activo: "green",
  Inactivo: "gray",
  Desafiliado: "red",
};

function Detail({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-ui-xs font-medium tracking-[0.02em] text-ink-3 uppercase">{label}</dt>
      <dd className="text-ui-lg break-words text-ink-1">{value}</dd>
    </div>
  );
}

function ViewBody({
  member,
  positionsById,
  onEditMode,
}: {
  member: Member;
  positionsById: Map<string, Position>;
  onEditMode: () => void;
}) {
  const termKey = currentTermKey();
  const term = member.positions?.[termKey];
  const cargo = term?.cargoId ? positionsById.get(term.cargoId) : undefined;
  const comisiones = (term?.comisionIds ?? []).flatMap((id) => positionsById.get(id) ?? []);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Avatar src={member.profilePicture} name={member.name} size={56} />
        <div className="min-w-0">
          <div className="truncate text-[18px] font-semibold text-ink-1">{member.name}</div>
          <Badge tone={STATUS_TONE[member.status]} dot={member.status === "Activo"}>
            {member.status}
          </Badge>
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-5">
        <Detail label="Correo" value={member.email} />
        <Detail label="Cargo" value={memberPositionLabel(member, positionsById, termKey)} />
        <Detail label="Teléfono" value={member.phone || "—"} />
        <Detail label="Profesión" value={member.profession || "—"} />
        <Detail label="Miembro desde" value={member.joinDate ? joinYear(member.joinDate) : "—"} />
        <Detail label="Puntos" value={member.totalPoints ?? 0} />
      </dl>

      {(cargo || comisiones.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {cargo && (
            <Badge tone={cargo.category === "CEL" ? "navy" : "teal"}>
              {positionTitle(cargo, member.gender)}
            </Badge>
          )}
          {comisiones.map((comision) => (
            <Badge key={comision.id} tone="gray">
              {comision.sigla ?? comision.title}
            </Badge>
          ))}
        </div>
      )}

      <div className="mt-2 flex flex-col gap-3">
        <Can I="update" a="Member">
          <Button as="button" type="button" onClick={onEditMode} className="w-full justify-center">
            Editar perfil
          </Button>
        </Can>
        <Link
          to="/members/$memberId"
          params={{ memberId: member.id }}
          className="text-center text-ui-md font-semibold text-jci-blue transition-colors hover:text-jci-navy"
        >
          Ver perfil completo
        </Link>
      </div>
    </div>
  );
}

function EditBody({
  member,
  positions,
  onSubmit,
}: {
  member: Member;
  positions: Position[];
  onSubmit: (data: MemberInput) => Promise<void>;
}) {
  const { onUpload, onRemove } = useMemberPhoto(member.id);
  const { canAssignPowerGrants } = useCan();
  return (
    <div className="flex flex-col gap-6">
      <ImageUploader
        currentSrc={member.profilePicture}
        name={member.name}
        onUpload={onUpload}
        onRemove={onRemove}
      />
      <MemberForm
        key={member.id}
        positions={positions}
        defaultValues={memberFormDefaults(member)}
        submitLabel="Guardar"
        allowPowerGrants={canAssignPowerGrants}
        onSubmit={onSubmit}
      />
    </div>
  );
}

export function MemberDrawer({
  open,
  mode,
  member,
  positions,
  onClose,
  onEditMode,
  onSubmit,
}: MemberDrawerProps) {
  const positionsById = new Map(positions.map((p) => [p.id, p]));
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={mode === "view" ? "Perfil del miembro" : "Editar miembro"}
      size="md"
    >
      {member &&
        (mode === "view" ? (
          <ViewBody member={member} positionsById={positionsById} onEditMode={onEditMode} />
        ) : (
          <EditBody member={member} positions={positions} onSubmit={onSubmit} />
        ))}
    </Sheet>
  );
}
