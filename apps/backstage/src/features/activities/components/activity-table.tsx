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
import type { Activity, ActivityStatus } from "@luminova/types";
import { CATEGORY_LABELS } from "../category-labels";

interface ActivityTableProps {
  activities: Activity[];
  onEdit: (activity: Activity) => void;
  onCancel: (activity: Activity) => void;
}

const STATUS_TONE: Record<ActivityStatus, BadgeTone> = {
  Programada: "gray",
  Ejecutada: "green",
  Cancelada: "red",
};

const DATE_FORMAT = new Intl.DateTimeFormat("es-BO", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function ActivityTable({ activities, onEdit, onCancel }: ActivityTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Categoría</TableHead>
          <TableHead>Fecha</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {activities.map((activity) => (
          <TableRow key={activity.id}>
            <TableCell className="font-semibold text-ink-1">
              {CATEGORY_LABELS[activity.category]}
            </TableCell>
            <TableCell className="text-ink-2 tabular-nums">
              {DATE_FORMAT.format(activity.startAt.toDate())}
            </TableCell>
            <TableCell>
              <Badge tone={STATUS_TONE[activity.status]}>{activity.status}</Badge>
            </TableCell>
            <TableCell>
              <div className="flex gap-2">
                <IconButton
                  as="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Editar ${CATEGORY_LABELS[activity.category]}`}
                  onClick={() => onEdit(activity)}
                >
                  {Icon.settings({ s: 17 })}
                </IconButton>
                {activity.status !== "Cancelada" && (
                  <IconButton
                    as="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Cancelar ${CATEGORY_LABELS[activity.category]}`}
                    onClick={() => onCancel(activity)}
                  >
                    {Icon.close({ s: 17 })}
                  </IconButton>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
