import {
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Icon,
  IconButton,
  type BadgeTone,
} from "@luminova/ui";
import { Link } from "@tanstack/react-router";
import type { Activity, ActivityStatus } from "@luminova/types";
import { CATEGORY_LABELS } from "../category-labels";
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

const STATUS_TONE: Record<ActivityStatus, BadgeTone> = {
  Programada: "gray",
  Ejecutada: "green",
  Cancelada: "red",
};

export function ActivityTable({
  activities,
  onEdit,
  onCancel,
  canManage,
  parentTitleById,
  checkInOpenById,
}: ActivityTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Actividad</TableHead>
          <TableHead>Fecha</TableHead>
          <TableHead>Estado</TableHead>
          {canManage && <TableHead>Acciones</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {activities.map((activity) => {
          const parentTitle = activity.parentId ? parentTitleById[activity.parentId] : null;
          const open = checkInOpenById[activity.id] ?? false;
          return (
            <TableRow key={activity.id}>
              <TableCell>
                <div className="flex flex-col gap-1">
                  <Link
                    to="/activities/$id"
                    params={{ id: activity.id }}
                    className="font-semibold text-ink-1 underline-offset-4 hover:text-jci-blue hover:underline"
                  >
                    {activity.title}
                  </Link>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[12.5px] text-ink-3">
                      {CATEGORY_LABELS[activity.category]}
                    </span>
                    {parentTitle && <Badge tone="blue">{parentTitle}</Badge>}
                    {!open && activity.status !== "Cancelada" && (
                      <Badge tone="gray">Check-in cerrado</Badge>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-ink-2 tabular-nums">
                {formatActivityDateTime(activity.startAt)}
              </TableCell>
              <TableCell>
                <Badge tone={STATUS_TONE[activity.status]}>{activity.status}</Badge>
              </TableCell>
              {canManage && (
                <TableCell>
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
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
