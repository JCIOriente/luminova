import type { Timestamp } from "firebase-admin/firestore";
import {
  resolvePointRuleCode,
  computePunctualityFactor,
  type ActivityCategory,
  type InitiativeKind,
  type Participation,
} from "@luminova/types/engine";
import type { CheckIn } from "./check-in.js";
import { participationId } from "./participation-id.js";

/** The activity facts the engine needs (read from activities/{id}). */
export interface ActivityRef {
  id: string;
  termId: string;
  category: ActivityCategory;
  parentType: InitiativeKind | null;
  parentId: string | null;
  startAt: Timestamp;
}

/** UTC `YYYY-MM` for epoch millis. */
export function monthBucketFromMillis(ms: number): string {
  const date = new Date(ms);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/** UTC `YYYY-MM` for a Firestore Timestamp. */
export function monthBucketOf(ts: Timestamp): string {
  return monthBucketFromMillis(ts.toMillis());
}

export interface DeriveInput {
  checkIn: CheckIn;
  activity: ActivityRef;
  basePoints: number;
  reportFiled: boolean;
}

/**
 * Derive the full participation document from a check-in + its activity.
 * Returns null when no point rule applies (the caller writes no row).
 * `createdAt` is the check-in time (deterministic — keeps overwrites idempotent).
 */
export function deriveParticipation({
  checkIn,
  activity,
  basePoints,
  reportFiled,
}: DeriveInput): Participation | null {
  const pointRuleCode = resolvePointRuleCode({
    role: checkIn.role,
    parentType: activity.parentType,
    category: activity.category,
  });
  if (pointRuleCode === null) return null;

  const punctualityFactor = computePunctualityFactor({
    role: checkIn.role,
    checkInAt: checkIn.checkInAt,
    startAt: activity.startAt,
  });
  const finalReportFiled = activity.parentId === null ? true : reportFiled;
  const attendanceRegistered = true;
  const state = attendanceRegistered && finalReportFiled ? "confirmed" : "provisional";

  return {
    id: participationId(activity.id, checkIn.memberId, checkIn.role),
    memberId: checkIn.memberId,
    termId: activity.termId,
    activityId: activity.id,
    parentType: activity.parentType,
    parentId: activity.parentId,
    role: checkIn.role,
    pointRuleCode,
    basePoints,
    punctualityFactor,
    computedPoints: basePoints * punctualityFactor,
    monthBucket: monthBucketOf(activity.startAt),
    state,
    gates: { attendanceRegistered, finalReportFiled },
    checkInAt: checkIn.checkInAt,
    voidReason: null,
    createdAt: checkIn.checkInAt,
  };
}
