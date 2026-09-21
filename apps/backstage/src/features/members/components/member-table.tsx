import { useMemo } from "react";
import {
  DataTable,
  Badge,
  EmptyState,
  Icon,
  IconButton,
  initials,
  type DataTableColumn,
  type BadgeTone,
} from "@luminova/ui";
import {
  boliviaWhatsAppUrl,
  currentTermKey,
  type Member,
  type MemberStatus,
  type Position,
} from "@luminova/types";
import { avatarColor, joinYear } from "../lib/member-display";
import { MemberRowMenu } from "./member-row-menu";
import { MemberCargoChips } from "./member-cargo-chips";

interface MemberTableProps {
  members: Member[];
  pageSize: number;
  roleLabel: (member: Member) => string;
  positionsById: Map<string, Position>;
  isLoading?: boolean;
  emptyState?: React.ReactNode;
  onView: (member: Member) => void;
  onEdit: (member: Member) => void;
  onProvision: (member: Member) => void;
  onSetStatus: (member: Member, status: MemberStatus) => void;
  onUnpublish: (member: Member) => void;
}

const STATUS_TONE: Record<MemberStatus, BadgeTone> = {
  Activo: "green",
  Inactivo: "gray",
  Desafiliado: "red",
};

function buildColumns(
  roleLabel: (member: Member) => string,
  positionsById: Map<string, Position>,
): DataTableColumn<Member>[] {
  return [
    {
      id: "name",
      header: "Miembro",
      sortValue: (member) => member.name,
      cell: (member) => (
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-ui-xs font-semibold text-white"
            style={{ backgroundColor: avatarColor(member.id) }}
          >
            {initials(member.name)}
          </span>
          <div className="min-w-0">
            <div className="truncate font-semibold text-ink-1">{member.name}</div>
            <div className="truncate text-ui-xs text-ink-3">{member.email}</div>
          </div>
        </div>
      ),
    },
    {
      id: "role",
      header: "Cargo",
      className: "hidden sm:table-cell",
      sortValue: roleLabel,
      cell: (member) => (
        <MemberCargoChips
          member={member}
          positionsById={positionsById}
          termKey={currentTermKey()}
        />
      ),
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
      className: "hidden md:table-cell",
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
      className: "hidden md:table-cell",
      sortValue: (member) => member.totalPoints ?? 0,
      cell: (member) => <span className="tabular-nums text-ink-2">{member.totalPoints ?? 0}</span>,
    },
  ];
}

function MemberWhatsAppAction({ member }: { member: Member }) {
  const url = boliviaWhatsAppUrl(member.phone);
  if (!url) {
    return (
      <IconButton as="button" variant="ghost" disabled aria-label="Sin teléfono registrado">
        {Icon.whatsapp({ s: 18 })}
      </IconButton>
    );
  }
  return (
    <IconButton
      as="a"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      variant="ghost"
      aria-label={`Escribir a ${member.name} por WhatsApp`}
      onClick={(e) => e.stopPropagation()}
    >
      {Icon.whatsapp({ s: 18 })}
    </IconButton>
  );
}

export function MemberTable({
  members,
  pageSize,
  roleLabel,
  positionsById,
  isLoading,
  emptyState,
  onView,
  onEdit,
  onProvision,
  onSetStatus,
  onUnpublish,
}: MemberTableProps) {
  const columns = useMemo(() => buildColumns(roleLabel, positionsById), [roleLabel, positionsById]);
  return (
    <DataTable
      rows={members}
      columns={columns}
      getRowId={(member) => member.id}
      isLoading={isLoading}
      pageSize={pageSize}
      pageSizeOptions={[8, 16, 32]}
      paginationLabel="miembros"
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
        <div className="flex items-center gap-1">
          <MemberWhatsAppAction member={member} />
          <MemberRowMenu
            member={member}
            positionsById={positionsById}
            onView={onView}
            onEdit={onEdit}
            onProvision={onProvision}
            onSetStatus={onSetStatus}
            onUnpublish={onUnpublish}
          />
        </div>
      )}
    />
  );
}
