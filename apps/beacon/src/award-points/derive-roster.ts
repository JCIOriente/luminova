import type { PointRuleCode, InitiativeKind, Participation } from "@luminova/types/engine";
import type { RosterRole, InitiativeWrite } from "./store.js";
import { participationId } from "./participation-id.js";
import { monthBucketFromMillis } from "./derive.js";

/** Flatten a roster into the (member, role) pairs the engine should award. */
export function desiredRosterRoles(
  roster: InitiativeWrite["roster"],
): { memberId: string; role: RosterRole }[] {
  const out: { memberId: string; role: RosterRole }[] = [];
  if (roster.directorId) out.push({ memberId: roster.directorId, role: "Director" });
  for (const id of roster.coDirectorIds) {
    if (id) out.push({ memberId: id, role: "CoDirector" });
  }
  for (const id of roster.teamIds) {
    if (id) out.push({ memberId: id, role: "Team" });
  }
  return out;
}

export interface DeriveRosterInput {
  parentType: InitiativeKind;
  parentId: string;
  termId: string;
  memberId: string;
  role: RosterRole;
  pointRuleCode: PointRuleCode;
  basePoints: number;
  reportFiled: boolean;
  filedAtMillis: number | null;
  fallbackMonth: string;
  createdAt: Participation["createdAt"];
}

/** Build the roster-derived participation row (no check-in; report-gated). */
export function deriveRosterRow(input: DeriveRosterInput): Participation {
  const finalReportFiled = input.reportFiled;
  const monthBucket =
    finalReportFiled && input.filedAtMillis !== null
      ? monthBucketFromMillis(input.filedAtMillis)
      : input.fallbackMonth;
  return {
    id: participationId(input.parentId, input.memberId, input.role),
    memberId: input.memberId,
    termId: input.termId,
    activityId: input.parentId,
    parentType: input.parentType,
    parentId: input.parentId,
    role: input.role,
    pointRuleCode: input.pointRuleCode,
    basePoints: input.basePoints,
    punctualityFactor: 1,
    computedPoints: input.basePoints,
    monthBucket,
    state: finalReportFiled ? "confirmed" : "provisional",
    gates: { attendanceRegistered: true, finalReportFiled },
    checkInAt: null,
    voidReason: null,
    createdAt: input.createdAt,
  };
}
