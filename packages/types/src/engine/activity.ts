import type { Timestamp } from "./timestamp.js";
import type { Photo } from "./initiative.js";

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

export const INITIATIVE_KINDS = ["Program", "Project"] as const;
export type InitiativeKind = (typeof INITIATIVE_KINDS)[number];

/**
 * Fields locked once an activity has check-ins — they feed the points derivation
 * (category → point rule, startAt → punctuality factor, parentId/parentType → rule
 * resolution + report gate, termId → point-rule table + aggregate bucket), so mutating
 * them would silently change what already-awarded points mean. Single source of truth:
 * `firestore.rules` activityLockSafe() enforces the persistent gate and the backstage
 * `activity-guard.ts` derives its client-side pre-check from this same list. Keep the
 * three in lockstep — cross-checked by tests/firestore-rules/rules.test.ts.
 */
export const ACTIVITY_LOCKED_FIELDS = [
  "category",
  "startAt",
  "parentId",
  "parentType",
  "termId",
] as const;
export type ActivityLockedField = (typeof ACTIVITY_LOCKED_FIELDS)[number];

/** Activity-level direction (informational on parented activities — awards nothing; see spec decision 9). */
export interface ActivityOrganizers {
  directorId: string | null;
  coDirectorIds: string[];
}

/**
 * The attendable unit. Institutional categories have `parentId === null`;
 * `ProjectExecution` is tied to a parent Program/Project (Invariant A).
 */
export interface Activity {
  id: string;
  termId: string;
  title: string;
  description: string | null;
  /** Free-text venue: a physical address or a virtual meeting link. */
  location: string | null;
  category: ActivityCategory;
  parentType: InitiativeKind | null;
  parentId: string | null;
  organizers: ActivityOrganizers;
  startAt: Timestamp;
  endAt: Timestamp | null;
  photos: Photo[];
  status: ActivityStatus;
  /** Beacon-maintained (awardPoints mirror; clients may never write it). True once
   * any check-in references this activity — firestore.rules then locks
   * the ACTIVITY_LOCKED_FIELDS set. Absent on pre-feature docs. */
  hasCheckIns?: boolean;
}
