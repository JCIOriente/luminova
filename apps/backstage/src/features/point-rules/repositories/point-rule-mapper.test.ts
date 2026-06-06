import { describe, it, expect } from "vitest";
import { POINT_RULE_CODES, DEFAULT_POINT_VALUES, POINT_RULE_LABELS } from "@luminova/types";
import type { PointRule } from "@luminova/types";
import { toSeedRules, byMatrixOrder } from "./point-rule-mapper";

describe("toSeedRules", () => {
  it("produces 16 rules with matrix points, labels, deterministic ids and termId", () => {
    const rules = toSeedRules("2026");
    expect(rules).toHaveLength(16);
    const direct = rules.find((r) => r.code === "DirectProgram")!;
    expect(direct).toEqual({
      id: "2026__DirectProgram",
      termId: "2026",
      code: "DirectProgram",
      points: DEFAULT_POINT_VALUES.DirectProgram,
      label: POINT_RULE_LABELS.DirectProgram,
    });
  });

  it("covers every code exactly once", () => {
    const codes = toSeedRules("2026")
      .map((r) => r.code)
      .sort();
    expect(codes).toEqual([...POINT_RULE_CODES].sort());
  });
});

describe("byMatrixOrder", () => {
  it("sorts rules into POINT_RULE_CODES order regardless of input order", () => {
    const shuffled: PointRule[] = [
      { id: "x", termId: "2026", code: "AttendTM", points: 6, label: "TM" },
      { id: "y", termId: "2026", code: "DirectProgram", points: 10, label: "P" },
    ];
    expect(
      shuffled
        .slice()
        .sort(byMatrixOrder)
        .map((r) => r.code),
    ).toEqual(["DirectProgram", "AttendTM"]);
  });
});
