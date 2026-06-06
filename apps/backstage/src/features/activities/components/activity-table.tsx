import {
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  type BadgeTone,
} from "@luminova/ui";
import type { Activity, ActivityStatus } from "@luminova/types";
import { CATEGORY_LABELS } from "../category-labels";

interface ActivityTableProps {
  activities: Activity[];
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

export function ActivityTable({ activities }: ActivityTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Categoría</TableHead>
          <TableHead>Fecha</TableHead>
          <TableHead>Estado</TableHead>
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
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
