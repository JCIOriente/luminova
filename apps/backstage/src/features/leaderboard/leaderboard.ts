import type { Member, MemberPoints, Term } from "@luminova/types";
import { evaluateEligibility } from "@luminova/types/engine";

export interface LeaderboardEntry {
  rank: number;
  memberId: string;
  name: string;
  points: number;
  isBestOfMonth: boolean;
}

export interface RankContext {
  points: MemberPoints[];
  membersById: Map<string, Member>;
  currentTerm: Term | null;
  previousTerm: Term | null;
}

function competes(member: Member, ctx: RankContext): boolean {
  if (ctx.currentTerm === null) return true;
  return evaluateEligibility({
    memberId: member.id,
    isPastPresident: member.isPastPresident ?? false,
    currentTerm: ctx.currentTerm,
    previousTerm: ctx.previousTerm,
  }).canCompete;
}

function ranked(
  ctx: RankContext,
  valueOf: (mp: MemberPoints) => number,
  bestOfMonth: boolean,
): LeaderboardEntry[] {
  const rows = ctx.points
    .map((mp) => ({ member: ctx.membersById.get(mp.memberId), points: valueOf(mp) }))
    .filter(
      (r): r is { member: Member; points: number } =>
        r.member !== undefined && r.member.active && r.points > 0,
    )
    .filter((r) => competes(r.member, ctx))
    .sort((x, y) =>
      y.points !== x.points
        ? y.points - x.points
        : x.member.name.localeCompare(y.member.name, "es"),
    );
  return rows.map((r, i) => ({
    rank: i + 1,
    memberId: r.member.id,
    name: r.member.name,
    points: r.points,
    isBestOfMonth: bestOfMonth && i === 0,
  }));
}

export function rankAnnual(ctx: RankContext): LeaderboardEntry[] {
  return ranked(ctx, (mp) => mp.cumulative, false);
}

export function rankMonthly(ctx: RankContext, month: string): LeaderboardEntry[] {
  return ranked(ctx, (mp) => mp.byMonth[month] ?? 0, true);
}

export function monthsPresent(points: MemberPoints[]): string[] {
  const set = new Set<string>();
  for (const mp of points) for (const key of Object.keys(mp.byMonth)) set.add(key);
  return [...set].sort((a, b) => (a < b ? 1 : -1));
}
