import type { Timestamp } from "./timestamp.js";
import type { PointRuleCode } from "./point-rule.js";
import type { InitiativeKind } from "./activity.js";

export const PARTICIPATION_ROLES = ["Director", "CoDirector", "Team", "Attendee"] as const;
export type ParticipationRole = (typeof PARTICIPATION_ROLES)[number];

export const PARTICIPATION_STATES = ["provisional", "confirmed", "voided"] as const;
export type ParticipationState = (typeof PARTICIPATION_STATES)[number];

export interface ParticipationGates {
  attendanceRegistered: boolean;
  /** Only meaningful when the activity has a parent Program/Project. */
  finalReportFiled: boolean;
}

/** Ledger row — written by the engine (A2) only; client read-only. */
export interface Participation {
  id: string;
  memberId: string;
  termId: string;
  activityId: string;
  parentType: InitiativeKind | null; // denormalized from the activity (for report-gate query)
  parentId: string | null;
  role: ParticipationRole;
  pointRuleCode: PointRuleCode;
  basePoints: number;
  punctualityFactor: 1 | 0.5;
  computedPoints: number;
  monthBucket: string;
  state: ParticipationState;
  gates: ParticipationGates;
  checkInAt: Timestamp | null;
  voidReason: string | null;
  createdAt: Timestamp;
}
