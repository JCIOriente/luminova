import type { Activity } from "@luminova/types";
import { BOLIVIA_OFFSET_MS } from "../../../lib/datetime";

export const ACTIVITY_TABS = ["proximos", "mes", "todas"] as const;
export type ActivityTab = (typeof ACTIVITY_TABS)[number];

export const ACTIVITY_TAB_LABELS: Record<ActivityTab, string> = {
  proximos: "Próximos",
  mes: "Este mes",
  todas: "Todas",
};

/**
 * Filter the term's activities for a tab. `startAt` is the scheduled wall-clock
 * pinned to UTC (see activity-mapper), so compare against the *Bolivia* wall-clock
 * — `now` shifted by the offset — read in UTC. Comparing the pinned value against
 * the raw instant would drop today's later events up to 4h early.
 */
export function filterActivities(activities: Activity[], tab: ActivityTab, now: Date): Activity[] {
  if (tab === "todas") return activities;
  const nowBolivia = new Date(now.getTime() - BOLIVIA_OFFSET_MS);
  if (tab === "proximos") {
    return activities.filter(
      (a) => a.status !== "Cancelada" && a.startAt.toMillis() >= nowBolivia.getTime(),
    );
  }
  return activities.filter((a) => {
    const d = a.startAt.toDate();
    return (
      d.getUTCFullYear() === nowBolivia.getUTCFullYear() &&
      d.getUTCMonth() === nowBolivia.getUTCMonth()
    );
  });
}
