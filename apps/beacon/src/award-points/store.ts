import type { PointRuleCode, InitiativeKind, Participation } from "@luminova/types/engine";
import type { ActivityRef } from "./derive.js";
import type { AggregateRow, MemberAggregate } from "./aggregate.js";

/** All Firestore access the engine needs, behind an interface so the orchestration is unit-testable. */
export interface EngineStore {
  getActivity(activityId: string): Promise<ActivityRef | null>;
  /** The term's edited points for a code, or null to fall back to DEFAULT_POINT_VALUES. */
  getPointRulePoints(termId: string, code: PointRuleCode): Promise<number | null>;
  isReportFiled(parentType: InitiativeKind, parentId: string): Promise<boolean>;
  getParticipation(id: string): Promise<Participation | null>;
  setParticipation(row: Participation): Promise<void>;
  deleteParticipation(id: string): Promise<void>;
  getConfirmedRows(memberId: string, termId: string): Promise<AggregateRow[]>;
  getRowsByParent(parentId: string): Promise<Participation[]>;
  setMemberAggregate(memberId: string, termId: string, aggregate: MemberAggregate): Promise<void>;
  /** Resolve member ids -> linked auth uids (members without a login are skipped). */
  getMemberUids(memberIds: string[]): Promise<string[]>;
  /**
   * Mirror direction uids onto the initiative doc (rules read them). Must be
   * idempotent and skip identical values — this runs inside the initiative's own
   * trigger, so an unconditional write would loop.
   */
  setInitiativeDirectionUids(
    parentType: InitiativeKind,
    parentId: string,
    uids: string[],
  ): Promise<void>;
}

export type RosterRole = "Director" | "CoDirector" | "Team";

/** The initiative facts the engine needs from a programs/projects write. */
export interface InitiativeWrite {
  termId: string;
  roster: { directorId: string; coDirectorIds: string[]; teamIds: string[] };
  reportFiled: boolean;
  filedAtMillis: number | null;
}
