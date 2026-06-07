import {
  DataTable,
  Badge,
  EmptyState,
  Icon,
  type DataTableColumn,
  type FilterChip,
  type BadgeTone,
} from "@luminova/ui";
import { MEMBER_STATUSES, type Member, type MemberStatus } from "@luminova/types";
import { dateInputValue } from "../repositories/member-mapper";
import { initials } from "../../../lib/initials";
import { RowAction } from "../../../components/row-action";
import { Can } from "../../../lib/authz/ability-context";

interface MemberTableProps {
  members: Member[];
  onView: (member: Member) => void;
  onEdit: (member: Member) => void;
  onDelete: (member: Member) => void;
}

const STATUS_TONE: Record<MemberStatus, BadgeTone> = {
  Activo: "green",
  Inactivo: "gray",
  Desafiliado: "red",
};

const STATUS_CHIPS: FilterChip[] = MEMBER_STATUSES.map((status) => ({
  id: status,
  label: status,
  active: false,
}));

const COLUMNS: DataTableColumn<Member>[] = [
  {
    id: "name",
    header: "Miembro",
    sortValue: (member) => member.name,
    cell: (member) => (
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-jci-navy text-[12px] font-semibold text-white">
          {initials(member.name)}
        </span>
        <div className="min-w-0">
          <div className="truncate font-semibold text-ink-1">{member.name}</div>
          <div className="truncate text-[12px] text-ink-3">{member.email}</div>
        </div>
      </div>
    ),
  },
  {
    id: "role",
    header: "Rol",
    sortValue: (member) => member.role,
    cell: (member) => <span className="text-ink-2">{member.role}</span>,
  },
  {
    id: "status",
    header: "Estado",
    sortValue: (member) => member.status ?? "",
    cell: (member) =>
      member.status ? (
        <Badge tone={STATUS_TONE[member.status]} dot>
          {member.status}
        </Badge>
      ) : (
        "—"
      ),
  },
  {
    id: "points",
    header: "Puntos",
    sortValue: (member) => member.totalPoints ?? 0,
    cell: (member) => <span className="tabular-nums text-ink-2">{member.totalPoints ?? 0}</span>,
  },
  {
    id: "joinDate",
    header: "Ingreso",
    sortValue: (member) => (member.joinDate ? dateInputValue(member.joinDate) : ""),
    cell: (member) => (
      <span className="tabular-nums text-ink-2">
        {member.joinDate ? dateInputValue(member.joinDate) : "—"}
      </span>
    ),
  },
];

export function MemberTable({ members, onView, onEdit, onDelete }: MemberTableProps) {
  return (
    <DataTable
      rows={members}
      columns={COLUMNS}
      getRowId={(member) => member.id}
      searchText={(member) => `${member.name} ${member.email} ${member.role}`}
      searchPlaceholder="Buscar por nombre, correo o rol"
      chips={STATUS_CHIPS}
      chipPredicate={(member, activeChipIds) => activeChipIds.includes(member.status)}
      emptyState={
        <EmptyState
          icon={Icon.user({ s: 40 })}
          title="No hay miembros todavía"
          description="Cuando agregues miembros del capítulo, aparecerán aquí."
        />
      }
      rowActions={(member) => (
        <div className="inline-flex gap-1">
          <Can I="read" a="Member">
            <RowAction
              icon={Icon.compass({ s: 17 })}
              label={`Ver a ${member.name}`}
              onClick={() => onView(member)}
            />
          </Can>
          <Can I="update" a="Member">
            <RowAction
              icon={Icon.settings({ s: 17 })}
              label={`Editar a ${member.name}`}
              onClick={() => onEdit(member)}
            />
          </Can>
          <Can I="delete" a="Member">
            <RowAction
              icon={Icon.close({ s: 17 })}
              label={`Eliminar a ${member.name}`}
              variant="danger"
              onClick={() => onDelete(member)}
            />
          </Can>
        </div>
      )}
    />
  );
}
