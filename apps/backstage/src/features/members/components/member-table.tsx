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
                  {member.name.slice(0, 1).toUpperCase()}
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
                <button
                  type="button"
                  onClick={() => onEdit(member)}
                  aria-label={`Editar a ${member.name}`}
                  className="flex size-8 items-center justify-center rounded-[8px] text-ink-3 transition-colors hover:bg-ink-1/[0.04] hover:text-ink-1"
                >
                  {Icon.settings({ s: 17 })}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(member)}
                  aria-label={`Eliminar a ${member.name}`}
                  className="flex size-8 items-center justify-center rounded-[8px] text-ink-3 transition-colors hover:bg-error/10 hover:text-error"
                >
                  {Icon.close({ s: 17 })}
                </button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
