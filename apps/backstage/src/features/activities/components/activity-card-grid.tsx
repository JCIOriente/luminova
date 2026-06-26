import { EmptyState, Icon } from "@luminova/ui";
import type { Activity } from "@luminova/types";
import { ActivityCard, type CardDirector } from "./activity-card";

export type { CardDirector };

interface ActivityCardGridProps {
  activities: Activity[];
  parentTitleById: Record<string, string>;
  checkInOpenById: Record<string, boolean>;
  directorById: Record<string, CardDirector>;
  canManage: boolean;
  onEdit: (activity: Activity) => void;
  onCancel: (activity: Activity) => void;
}

export function ActivityCardGrid({
  activities,
  parentTitleById,
  checkInOpenById,
  directorById,
  canManage,
  onEdit,
  onCancel,
}: ActivityCardGridProps) {
  if (activities.length === 0) {
    return (
      <EmptyState
        icon={Icon.calendar({ s: 40 })}
        title="No hay actividades en este filtro"
        description="Prueba con otro filtro o crea una actividad nueva."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {activities.map((activity) => {
        const directorId = activity.organizers.directorId;
        return (
          <ActivityCard
            key={activity.id}
            activity={activity}
            parentTitle={activity.parentId ? (parentTitleById[activity.parentId] ?? null) : null}
            checkInOpen={checkInOpenById[activity.id] ?? false}
            director={directorId ? (directorById[directorId] ?? null) : null}
            canManage={canManage}
            onEdit={onEdit}
            onCancel={onCancel}
          />
        );
      })}
    </div>
  );
}
