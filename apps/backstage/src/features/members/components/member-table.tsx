import {
  Button,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  cn,
} from "@luminova/ui";
import type { Member, MemberStatus } from "../types/member";
import { dateInputValue } from "../repositories/member-mapper";

interface MemberTableProps {
  members: Member[];
  onEdit: (member: Member) => void;
  onDelete: (member: Member) => void;
}

const STATUS_TONE: Record<MemberStatus, string> = {
  Activo: "bg-jci-teal/15 text-jci-navy",
  Inactivo: "bg-surface-3 text-ink-2",
  Desafiliado: "bg-[#c0392b]/12 text-[#c0392b]",
};

function StatusBadge({ status }: { status: MemberStatus }) {
  return (
    <span
      className={cn(
        "inline-block rounded-pill px-2.5 py-1 text-[12px] font-semibold",
        STATUS_TONE[status],
      )}
    >
      {status}
    </span>
  );
}

export function MemberTable({ members, onEdit, onDelete }: MemberTableProps) {
  if (members.length === 0) {
    return <p className="text-ink-2">No hay miembros todavía.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nombre</TableHead>
          <TableHead>Correo</TableHead>
          <TableHead>Rol</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Ingreso</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((member) => (
          <TableRow key={member.id}>
            <TableCell className="font-medium">{member.name}</TableCell>
            <TableCell className="text-ink-2">{member.email}</TableCell>
            <TableCell>{member.role}</TableCell>
            <TableCell>{member.status ? <StatusBadge status={member.status} /> : "—"}</TableCell>
            <TableCell className="text-ink-2">
              {member.joinDate ? dateInputValue(member.joinDate) : "—"}
            </TableCell>
            <TableCell className="text-right">
              <div className="inline-flex gap-2">
                <Button
                  as="button"
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onEdit(member)}
                >
                  Editar
                </Button>
                <Button
                  as="button"
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onDelete(member)}
                >
                  Eliminar
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
