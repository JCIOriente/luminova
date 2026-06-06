export const POINT_RULE_CODES = [
  "DirectProgram",
  "CoDirectProgram",
  "DirectProject",
  "CoDirectProject",
  "DirectActivity",
  "CoDirectActivity",
  "ProgramProjectTeam",
  "AttendAssembly",
  "AttendCourse",
  "AttendActivity",
  "AttendNationalEvent",
  "AttendAnniversary",
  "AttendTM",
  "HeadTrainer",
  "AssistantTrainer",
  "PaymentPlanAdhesion",
] as const;
export type PointRuleCode = (typeof POINT_RULE_CODES)[number];

/** Matrix baseline point values (admin can edit per term). */
export const DEFAULT_POINT_VALUES: Record<PointRuleCode, number> = {
  DirectProgram: 10,
  CoDirectProgram: 8,
  DirectProject: 8,
  CoDirectProject: 6,
  DirectActivity: 5,
  CoDirectActivity: 3,
  ProgramProjectTeam: 4,
  AttendAssembly: 4,
  AttendCourse: 3,
  AttendActivity: 3,
  AttendNationalEvent: 5,
  AttendAnniversary: 5,
  AttendTM: 6,
  HeadTrainer: 7,
  AssistantTrainer: 5,
  PaymentPlanAdhesion: 5,
};

/** A term-scoped editable point value for one matrix row. */
export interface PointRule {
  id: string;
  termId: string;
  code: PointRuleCode;
  points: number;
  label: string;
}
