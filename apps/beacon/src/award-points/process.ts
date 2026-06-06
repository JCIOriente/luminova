import {
  DEFAULT_POINT_VALUES,
  resolvePointRuleCode,
  type ParticipationState,
} from "@luminova/types/engine";
import type { EngineStore } from "./store.js";
import type { CheckIn } from "./check-in.js";
import { deriveParticipation } from "./derive.js";
import { participationId } from "./participation-id.js";
import { aggregateFromRows } from "./aggregate.js";

/** Derive + persist the participation row for a check-in, then recompute the member aggregate. */
export async function processCheckIn(store: EngineStore, checkIn: CheckIn): Promise<void> {
  const activity = await store.getActivity(checkIn.activityId);
  if (activity === null) return; // missing activity — nothing to compute

  const code = resolvePointRuleCode({
    role: checkIn.role,
    parentType: activity.parentType,
    category: activity.category,
  });
  if (code === null) return; // no rule applies (e.g. Team on an institutional activity)

  const edited = await store.getPointRulePoints(activity.termId, code);
  const basePoints = edited ?? DEFAULT_POINT_VALUES[code];
  const reportFiled =
    activity.parentType !== null && activity.parentId !== null
      ? await store.isReportFiled(activity.parentType, activity.parentId)
      : true;

  const row = deriveParticipation({ checkIn, activity, basePoints, reportFiled });
  if (row === null) return;
  await store.setParticipation(row);
  await recomputeAggregate(store, checkIn.memberId, activity.termId);
}

/** A check-in was deleted — remove its derived row and recompute. */
export async function processCheckInDelete(store: EngineStore, checkIn: CheckIn): Promise<void> {
  const activity = await store.getActivity(checkIn.activityId);
  await store.deleteParticipation(
    participationId(checkIn.activityId, checkIn.memberId, checkIn.role),
  );
  if (activity !== null) await recomputeAggregate(store, checkIn.memberId, activity.termId);
}

/** A program/project final report was filed or unfiled — re-confirm its rows. */
export async function processInitiativeReport(
  store: EngineStore,
  parentId: string,
  reportFiled: boolean,
): Promise<void> {
  const rows = await store.getRowsByParent(parentId);
  const affected = new Map<string, string>(); // memberId -> termId
  for (const row of rows) {
    const finalReportFiled = reportFiled;
    const state: ParticipationState =
      row.gates.attendanceRegistered && finalReportFiled ? "confirmed" : "provisional";
    await store.setParticipation({
      ...row,
      gates: { ...row.gates, finalReportFiled },
      state,
    });
    affected.set(row.memberId, row.termId);
  }
  for (const [memberId, termId] of affected) await recomputeAggregate(store, memberId, termId);
}

async function recomputeAggregate(
  store: EngineStore,
  memberId: string,
  termId: string,
): Promise<void> {
  const rows = await store.getConfirmedRows(memberId, termId);
  await store.setMemberAggregate(memberId, termId, aggregateFromRows(rows));
}
