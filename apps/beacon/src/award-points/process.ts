import {
  DEFAULT_POINT_VALUES,
  resolvePointRuleCode,
  type ParticipationState,
  type PointRuleCode,
} from "@luminova/types/engine";
import type { EngineStore, InitiativeWrite } from "./store.js";
import type { CheckIn } from "./check-in.js";
import { deriveParticipation, monthBucketFromMillis } from "./derive.js";
import { participationId } from "./participation-id.js";
import { aggregateFromRows } from "./aggregate.js";
import { deriveRosterRow, desiredRosterRoles } from "./derive-roster.js";

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
  const id = participationId(checkIn.activityId, checkIn.memberId, checkIn.role);
  // Read the row first: its termId is the source of truth for the recompute,
  // so deletion stays correct even if the activity is already gone.
  const existing = await store.getParticipation(id);
  await store.deleteParticipation(id);
  if (existing !== null) await recomputeAggregate(store, existing.memberId, existing.termId);
}

/**
 * Reconcile an initiative write: re-confirm its attendance rows per the report
 * gate, expand its roster into Director/CoDirector/Team rows, and void rows for
 * members no longer on the roster. Idempotent — runs on every programs/projects write.
 */
export async function processInitiativeWrite(
  store: EngineStore,
  parentType: "Program" | "Project",
  parentId: string,
  init: InitiativeWrite,
  now: { toMillis(): number; toDate(): Date },
): Promise<void> {
  const desired = desiredRosterRoles(init.roster);
  const desiredIds = new Set(desired.map((d) => participationId(parentId, d.memberId, d.role)));
  // Key by member+term — each term's aggregate is recomputed independently.
  const affected = new Map<string, { memberId: string; termId: string }>();
  const touch = (memberId: string, termId: string) =>
    affected.set(`${memberId} ${termId}`, { memberId, termId });

  const rows = await store.getRowsByParent(parentId);

  // 1. Re-confirm attendance rows (checkInAt != null) per the report gate; keep their month.
  for (const row of rows) {
    if (row.checkInAt === null) continue;
    const finalReportFiled = init.reportFiled;
    const state: ParticipationState =
      row.gates.attendanceRegistered && finalReportFiled ? "confirmed" : "provisional";
    if (row.state !== state || row.gates.finalReportFiled !== finalReportFiled) {
      await store.setParticipation({ ...row, gates: { ...row.gates, finalReportFiled }, state });
      touch(row.memberId, row.termId);
    }
  }

  // 2. Void roster rows (checkInAt === null) no longer desired.
  for (const row of rows) {
    if (row.checkInAt !== null) continue;
    if (!desiredIds.has(row.id)) {
      await store.deleteParticipation(row.id);
      touch(row.memberId, row.termId);
    }
  }

  // 3. Upsert each desired roster row.
  for (const { memberId, role } of desired) {
    const code = resolvePointRuleCode({ role, parentType, category: "ProjectExecution" });
    if (code === null) continue; // never for Director/CoDirector/Team with a parent
    const edited = await store.getPointRulePoints(init.termId, code);
    const basePoints = edited ?? DEFAULT_POINT_VALUES[code as PointRuleCode];
    const id = participationId(parentId, memberId, role);
    const existing = await store.getParticipation(id);
    // If the initiative's term changed, the prior term's aggregate must drop this row too.
    if (existing !== null && existing.termId !== init.termId) touch(memberId, existing.termId);
    const fallbackMonth = existing?.monthBucket ?? monthBucketFromMillis(now.toMillis());
    const createdAt = existing?.createdAt ?? now;
    await store.setParticipation(
      deriveRosterRow({
        parentType,
        parentId,
        termId: init.termId,
        memberId,
        role,
        pointRuleCode: code,
        basePoints,
        reportFiled: init.reportFiled,
        filedAtMillis: init.filedAtMillis,
        fallbackMonth,
        createdAt,
      }),
    );
    touch(memberId, init.termId);
  }

  // 4. Recompute every affected member's aggregate.
  for (const { memberId, termId } of affected.values()) {
    await recomputeAggregate(store, memberId, termId);
  }
}

async function recomputeAggregate(
  store: EngineStore,
  memberId: string,
  termId: string,
): Promise<void> {
  const rows = await store.getConfirmedRows(memberId, termId);
  await store.setMemberAggregate(memberId, termId, aggregateFromRows(rows));
}
