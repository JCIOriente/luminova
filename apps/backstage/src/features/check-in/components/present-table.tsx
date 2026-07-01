import { Avatar, DataTable, EmptyState, Icon, type DataTableColumn } from "@luminova/ui";
import type { RosterEntry } from "../roster";
import { formatTime } from "../../../lib/datetime";

interface PresentTableProps {
  entries: RosterEntry[];
  onRemove: (entry: RosterEntry) => void;
}

const columns: DataTableColumn<RosterEntry>[] = [
  {
    id: "member",
    header: "Miembro",
    sortValue: (e) => e.name,
    cell: (e) => (
      <span className="flex items-center gap-3">
        <Avatar src={e.src} name={e.name} size={32} />
        <span className="flex flex-col">
          <span className="font-semibold text-ink-1">{e.name}</span>
          {e.profession && <span className="text-[12px] text-ink-3">{e.profession}</span>}
        </span>
      </span>
    ),
  },
  {
    id: "time",
    header: "Hora",
    sortValue: (e) => e.checkInAt?.toMillis() ?? 0,
    cell: (e) => (
      <span className="tabular-nums text-ink-2">{e.checkInAt ? formatTime(e.checkInAt) : "—"}</span>
    ),
  },
];

export function PresentTable({ entries, onRemove }: PresentTableProps) {
  return (
    <DataTable
      rows={entries}
      columns={columns}
      getRowId={(e) => `${e.memberId}__${e.role}`}
      searchText={(e) => `${e.name} ${e.profession ?? ""}`}
      searchPlaceholder="Filtrar presentes…"
      pageSize={16}
      paginationLabel="presentes"
      rowActions={(e) => (
        <button
          type="button"
          onClick={() => onRemove(e)}
          aria-label={`Quitar a ${e.name}`}
          className="grid size-8 place-items-center rounded-[8px] text-ink-3 transition-colors hover:bg-error/10 hover:text-error"
        >
          {Icon.close({ s: 16 })}
        </button>
      )}
      emptyState={
        <EmptyState
          icon={Icon.user({ s: 40 })}
          title="Nadie ha registrado asistencia aún"
          description="Escanea un carnet o registra a un miembro por su nombre para empezar."
        />
      }
    />
  );
}
