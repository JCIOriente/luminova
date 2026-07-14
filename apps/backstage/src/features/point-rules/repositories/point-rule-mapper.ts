import { POINT_RULE_CODES, DEFAULT_POINT_VALUES, POINT_RULE_LABELS } from "@luminova/types";
import type { PointRule, PointRuleCode } from "@luminova/types";

/** One rule per matrix code to seed for a term, with deterministic ids (idempotent re-seed). */
export function toSeedRules(termId: string): PointRule[] {
  return POINT_RULE_CODES.map((code) => ({
    id: `${termId}__${code}`,
    termId,
    code,
    points: DEFAULT_POINT_VALUES[code],
    label: POINT_RULE_LABELS[code],
  }));
}

const ORDER = new Map<PointRuleCode, number>(POINT_RULE_CODES.map((code, i) => [code, i]));

/** Comparator that orders rules by their matrix position. */
export function byMatrixOrder(a: PointRule, b: PointRule): number {
  return (ORDER.get(a.code) ?? 0) - (ORDER.get(b.code) ?? 0);
}
