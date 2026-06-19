import { useMemo } from "react";
import { DataTable, Badge, EmptyState, Icon, IconButton, type DataTableColumn } from "@luminova/ui";
import { Link } from "@tanstack/react-router";
import type { Activity } from "@luminova/types";
import { CATEGORY_LABELS } from "../category-labels";
import { ACTIVITY_STATUS_TONE } from "../lib/status-tone";
import { formatActivityDateTime } from "../lib/format";

interface ActivityTableProps {
  activities: Activity[];
  onEdit: (activity: Activity) => void;
  onCancel: (activity: Activity) => void;
  /** Show the edit/cancel column. Read-only viewers (e.g. Scanner) get a clean table. */
  canManage: boolean;
  /** Parent initiative title by parentId — labels Program/Project activities. */
  parentTitleById: Record<string, string>;
  /** Whether each activity is inside its check-in window (id -> open). */
  checkInOpenById: Record<string, boolean>;
}

function buildColumns(
  parentTitleById: Record<string, string>,
  checkInOpenById: Record<string, boolean>,
): DataTableColumn<Activity>[] {
  return [
    {
      id: "activity",
      header: "Actividad",
      sortValue: (activity) => activity.title,
      cell: (activity) => {
        const parentTitle = activity.parentId ? parentTitleById[activity.parentId] : null;
        const open = checkInOpenById[activity.id] ?? false;
        return (
          <div className="flex flex-col gap-1">
            <Link
              to="/activities/$id"
              params={{ id: activity.id }}
              className="font-semibold text-ink-1 underline-offset-4 hover:text-jci-blue hover:underline"
            >
              {activity.title}
            </Link>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12.5px] text-ink-3">{CATEGORY_LABELS[activity.category]}</span>
              {parentTitle && <Badge tone="blue">{parentTitle}</Badge>}
              {!open && activity.status !== "Cancelada" && (
                <Badge tone="gray">Check-in cerrado</Badge>
              )}
            </div>
          </div>
        );
      },
    },
    {
      id: "date",
      header: "Fecha",
      sortValue: (activity) => activity.startAt.toMillis(),
      cell: (activity) => (
        <span className="tabular-nums text-ink-2">{formatActivityDateTime(activity.startAt)}</span>
      ),
    },
    {
      id: "status",
      header: "Estado",
      sortable: false,
      cell: (activity) => (
        <Badge tone={ACTIVITY_STATUS_TONE[activity.status]}>{activity.status}</Badge>
      ),
    },
  ];
}

export function ActivityTable({
  activities,
  onEdit,
  onCancel,
  canManage,
  parentTitleById,
  checkInOpenById,
}: ActivityTableProps) {
  const columns = useMemo(
    () => buildColumns(parentTitleById, checkInOpenById),
    [parentTitleById, checkInOpenById],
  );
  return (
    <DataTable
      rows={activities}
      columns={columns}
      getRowId={(activity) => activity.id}
      pageSize={16}
      paginationLabel="actividades"
      emptyState={
        <EmptyState
          icon={Icon.megaphone({ s: 40 })}
          title="No hay actividades todavía"
          description="Las actividades del capítulo aparecerán aquí cuando las programes."
        />
      }
      rowActions={
        canManage
          ? (activity) => (
              <div className="flex gap-2">
                <IconButton
                  as="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Editar ${activity.title}`}
                  onClick={() => onEdit(activity)}
                >
                  {Icon.settings({ s: 17 })}
                </IconButton>
                {activity.status !== "Cancelada" && (
                  <IconButton
                    as="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Cancelar ${activity.title}`}
                    onClick={() => onCancel(activity)}
                  >
                    {Icon.close({ s: 17 })}
                  </IconButton>
                )}
              </div>
            )
          : undefined
      }
    />
  );
}
