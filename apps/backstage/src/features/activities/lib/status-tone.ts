import type { ActivityStatus } from "@luminova/types";
import type { BadgeTone } from "@luminova/ui";

export const ACTIVITY_STATUS_TONE: Record<ActivityStatus, BadgeTone> = {
  Programada: "blue",
  Ejecutada: "green",
  Cancelada: "red",
};
