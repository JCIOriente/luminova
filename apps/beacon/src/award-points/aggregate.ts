import type { Participation } from "@luminova/types/engine";

export type AggregateRow = Pick<Participation, "computedPoints" | "monthBucket" | "state">;

export interface MemberAggregate {
  cumulative: number;
  byMonth: Record<string, number>;
}

/** Sum confirmed rows into cumulative + per-month totals. */
export function aggregateFromRows(rows: AggregateRow[]): MemberAggregate {
  const byMonth: Record<string, number> = {};
  let cumulative = 0;
  for (const row of rows) {
    if (row.state !== "confirmed") continue;
    cumulative += row.computedPoints;
    byMonth[row.monthBucket] = (byMonth[row.monthBucket] ?? 0) + row.computedPoints;
  }
  return { cumulative, byMonth };
}
