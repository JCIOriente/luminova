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
}

export type RosterRole = "Director" | "CoDirector" | "Team";

/** The initiative facts the engine needs from a programs/projects write. */
export interface InitiativeWrite {
  termId: string;
  roster: { directorId: string; coDirectorIds: string[]; teamIds: string[] };
  reportFiled: boolean;
  filedAtMillis: number | null;
}
