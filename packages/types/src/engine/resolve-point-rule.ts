import type { ActivityCategory, InitiativeKind } from "./activity.js";
import type { ParticipationRole } from "./participation.js";
import type { PointRuleCode } from "./point-rule.js";

export interface ResolvePointRuleInput {
  role: ParticipationRole;
  parentType: InitiativeKind | null;
  category: ActivityCategory;
}

const ATTEND_BY_CATEGORY: Record<ActivityCategory, PointRuleCode> = {
  Assembly: "AttendAssembly",
  Course: "AttendCourse",
  ProjectExecution: "AttendActivity",
  NationalEvent: "AttendNationalEvent",
  Anniversary: "AttendAnniversary",
  TM: "AttendTM",
  Cash: "AttendCash",
  Confra: "AttendConfra",
};

/**
 * Resolve the matrix code for a category/role-derived participation.
 * Returns `null` when no category rule applies (e.g. Team on an institutional
 * activity). HeadTrainer/AssistantTrainer/PaymentPlanAdhesion are awarded
 * explicitly by the caller, not through this resolver.
 */
export function resolvePointRuleCode({
  role,
  parentType,
  category,
}: ResolvePointRuleInput): PointRuleCode | null {
  switch (role) {
    case "Director":
      if (parentType === "Program") return "DirectProgram";
      if (parentType === "Project") return "DirectProject";
      return "DirectActivity";
    case "CoDirector":
      if (parentType === "Program") return "CoDirectProgram";
      if (parentType === "Project") return "CoDirectProject";
      return "CoDirectActivity";
    case "Team":
      return parentType === null ? null : "ProgramProjectTeam";
    case "Attendee":
      return ATTEND_BY_CATEGORY[category];
  }
}
