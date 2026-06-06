import {
  Badge,
  EmptyState,
  Icon,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  type BadgeTone,
} from "@luminova/ui";
import type { Member, MemberStatus } from "../types/member";
import { dateInputValue } from "../repositories/member-mapper";
import { initials } from "../../../lib/initials";
import { RowAction } from "../../../components/row-action";

interface MemberTableProps {
  members: Member[];
  onEdit: (member: Member) => void;
  onDelete: (member: Member) => void;
}

const STATUS_TONE: Record<MemberStatus, BadgeTone> = {
  Activo: "green",
  Inactivo: "gray",
  Desafiliado: "red",
};

export function MemberTable({ members, onEdit, onDelete }: MemberTableProps) {
  if (members.length === 0) {
    return (
      <EmptyState
        icon={Icon.user({ s: 40 })}
        title="No hay miembros todavía"
        description="Cuando agregues miembros del capítulo, aparecerán aquí."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Miembro</TableHead>
          <TableHead>Rol</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Ingreso</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((member) => (
          <TableRow key={member.id}>
            <TableCell>
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-jci-navy text-[12px] font-semibold text-white">
                  {initials(member.name)}
                </span>
                <div className="min-w-0">
                  <div className="truncate font-semibold text-ink-1">{member.name}</div>
                  <div className="truncate text-[12px] text-ink-3">{member.email}</div>
                </div>
              </div>
            </TableCell>
            <TableCell className="text-ink-2">{member.role}</TableCell>
            <TableCell>
              {member.status ? (
                <Badge tone={STATUS_TONE[member.status]} dot>
                  {member.status}
                </Badge>
              ) : (
                "—"
              )}
            </TableCell>
            <TableCell className="text-ink-2 tabular-nums">
              {member.joinDate ? dateInputValue(member.joinDate) : "—"}
            </TableCell>
            <TableCell className="text-right">
              <div className="inline-flex gap-1">
                <RowAction
                  icon={Icon.settings({ s: 17 })}
                  label={`Editar a ${member.name}`}
                  onClick={() => onEdit(member)}
                />
                <RowAction
                  icon={Icon.close({ s: 17 })}
                  label={`Eliminar a ${member.name}`}
                  variant="danger"
                  onClick={() => onDelete(member)}
                />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
