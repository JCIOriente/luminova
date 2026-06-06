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

/** Canonical Spanish matrix labels (parallel to DEFAULT_POINT_VALUES). */
export const POINT_RULE_LABELS: Record<PointRuleCode, string> = {
  DirectProgram: "Dirección de programa",
  CoDirectProgram: "Codirección de programa",
  DirectProject: "Dirección de proyecto",
  CoDirectProject: "Codirección de proyecto",
  DirectActivity: "Dirección de actividad",
  CoDirectActivity: "Codirección de actividad",
  ProgramProjectTeam: "Equipo de programa o proyecto",
  AttendAssembly: "Asistencia a asamblea",
  AttendCourse: "Asistencia a curso oficial o libre",
  AttendActivity: "Asistencia a actividad o proyecto",
  AttendNationalEvent: "Asistencia a evento nacional",
  AttendAnniversary: "Asistencia a aniversario (Local o Nacional)",
  AttendTM: "Asistencia a TM (Local o Nacional)",
  HeadTrainer: "Fungir como Head Trainer",
  AssistantTrainer: "Fungir como Assistant Trainer",
  PaymentPlanAdhesion: "Adhesión a un plan de pago",
};

/** A term-scoped editable point value for one matrix row. */
export interface PointRule {
  id: string;
  termId: string;
  code: PointRuleCode;
  points: number;
  label: string;
}
