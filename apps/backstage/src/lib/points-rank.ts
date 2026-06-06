import type { MemberPoints } from "@luminova/types/engine";

/** The member's 1-based rank by cumulative points among members with > 0 points.
 *  Null if the member has no positive entry. No eligibility exclusions (v1). */
export function pointsRank(
  all: MemberPoints[],
  memberId: string,
): { rank: number; total: number } | null {
  const scored = all.filter((p) => p.cumulative > 0);
  const mine = scored.find((p) => p.memberId === memberId);
  if (!mine) return null;
  const rank = scored.filter((p) => p.cumulative > mine.cumulative).length + 1;
  return { rank, total: scored.length };
}
