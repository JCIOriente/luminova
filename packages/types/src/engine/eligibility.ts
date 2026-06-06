import type { Term } from "./term";

export function isExecutiveCommittee(memberId: string, term: Term): boolean {
  return term.board.some((seat) => seat.memberId === memberId && seat.isExecutiveCommittee);
}

export function wonBestMemberPreviousTerm(memberId: string, previousTerm: Term | null): boolean {
  return previousTerm?.bestMemberId === memberId && memberId.length > 0;
}

export type IneligibilityReason = "PastPresident" | "ExecutiveCommittee" | "WonPreviousTerm";

export interface EvaluateEligibilityInput {
  memberId: string;
  isPastPresident: boolean;
  currentTerm: Term;
  previousTerm: Term | null;
}

export interface EligibilityResult {
  canAccrue: boolean;
  canCompete: boolean;
  reasons: IneligibilityReason[];
}

/**
 * Accrual vs competition (matrix "Parámetros Generales"):
 * - past presidents do NOT accrue;
 * - CEL members and the previous winner accrue but are excluded from the leaderboard.
 */
export function evaluateEligibility({
  memberId,
  isPastPresident,
  currentTerm,
  previousTerm,
}: EvaluateEligibilityInput): EligibilityResult {
  const reasons: IneligibilityReason[] = [];
  if (isPastPresident) reasons.push("PastPresident");
  if (isExecutiveCommittee(memberId, currentTerm)) reasons.push("ExecutiveCommittee");
  if (wonBestMemberPreviousTerm(memberId, previousTerm)) reasons.push("WonPreviousTerm");

  const canAccrue = !isPastPresident;
  const canCompete = canAccrue && reasons.length === 0;
  return { canAccrue, canCompete, reasons };
}
