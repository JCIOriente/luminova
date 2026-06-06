import type { Timestamp } from "./timestamp.js";

export const ACTIVITY_CATEGORIES = [
  "Assembly",
  "Course",
  "Anniversary",
  "TM",
  "NationalEvent",
  "ProjectExecution",
] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

export const ACTIVITY_STATUSES = ["Programada", "Ejecutada", "Cancelada"] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export type InitiativeKind = "Program" | "Project";

/** Activity-level direction (may differ from the parent initiative roster). */
export interface ActivityOrganizers {
  directorId: string | null;
  coDirectorId: string | null;
}

/**
 * The attendable unit. Institutional categories have `parentId === null`;
 * `ProjectExecution` is tied to a parent Program/Project (Invariant A).
 */
export interface Activity {
  id: string;
  termId: string;
  category: ActivityCategory;
  parentType: InitiativeKind | null;
  parentId: string | null;
  organizers: ActivityOrganizers;
  startAt: Timestamp;
  status: ActivityStatus;
}
