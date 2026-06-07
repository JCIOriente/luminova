import {
  DataTable,
  Badge,
  EmptyState,
  Icon,
  type DataTableColumn,
  type BadgeTone,
} from "@luminova/ui";
import { type Member, type MemberStatus } from "@luminova/types";
import { avatarColor, joinYear } from "../lib/member-display";
import { initials } from "../../../lib/initials";
import { MemberRowMenu } from "./member-row-menu";

interface MemberTableProps {
  members: Member[];
  pageSize: number;
  isLoading?: boolean;
  emptyState?: React.ReactNode;
  onView: (member: Member) => void;
  onEdit: (member: Member) => void;
  onProvision: (member: Member) => void;
  onSetStatus: (member: Member, status: MemberStatus) => void;
  onDelete: (member: Member) => void;
}

const STATUS_TONE: Record<MemberStatus, BadgeTone> = {
  Activo: "green",
  Inactivo: "gray",
  Desafiliado: "red",
};

const COLUMNS: DataTableColumn<Member>[] = [
  {
    id: "name",
    header: "Miembro",
    sortValue: (member) => member.name,
    cell: (member) => (
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white"
          style={{ backgroundColor: avatarColor(member.id) }}
        >
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
    sortable: false,
    cell: (member) => (
      <Badge tone={STATUS_TONE[member.status]} dot={member.status === "Activo"}>
        {member.status}
      </Badge>
    ),
  },
  {
    id: "joinDate",
    header: "Desde",
    sortValue: (member) => (member.joinDate ? joinYear(member.joinDate) : 0),
    cell: (member) => (
      <span className="tabular-nums text-ink-2">
        {member.joinDate ? joinYear(member.joinDate) : "—"}
      </span>
    ),
  },
  {
    id: "points",
    header: "Puntos",
    sortValue: (member) => member.totalPoints ?? 0,
    cell: (member) => <span className="tabular-nums text-ink-2">{member.totalPoints ?? 0}</span>,
  },
];

export function MemberTable({
  members,
  pageSize,
  isLoading,
  emptyState,
  onView,
  onEdit,
  onProvision,
  onSetStatus,
  onDelete,
}: MemberTableProps) {
  return (
    <DataTable
      rows={members}
      columns={COLUMNS}
      getRowId={(member) => member.id}
      isLoading={isLoading}
      pageSize={pageSize}
      pageSizeOptions={[8, 16, 32]}
      emptyState={
        emptyState ?? (
          <EmptyState
            icon={Icon.user({ s: 40 })}
            title="No hay miembros todavía"
            description="Cuando agregues miembros del capítulo, aparecerán aquí."
          />
        )
      }
      rowActions={(member) => (
        <MemberRowMenu
          member={member}
          onView={onView}
          onEdit={onEdit}
          onProvision={onProvision}
          onSetStatus={onSetStatus}
          onDelete={onDelete}
        />
      )}
    />
  );
}
