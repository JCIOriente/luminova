import { describe, it, expect } from "vitest";
import { POINT_RULE_CODES, DEFAULT_POINT_VALUES, POINT_RULE_LABELS } from "./point-rule";

describe("POINT_RULE_LABELS", () => {
  it("has a non-empty Spanish label for every code", () => {
    for (const code of POINT_RULE_CODES) {
      expect(POINT_RULE_LABELS[code]).toBeTruthy();
      expect(typeof POINT_RULE_LABELS[code]).toBe("string");
    }
  });

  it("covers exactly the 16 codes (parallel to DEFAULT_POINT_VALUES)", () => {
    expect(Object.keys(POINT_RULE_LABELS).sort()).toEqual(Object.keys(DEFAULT_POINT_VALUES).sort());
  });

  // Spot-check of two representative labels — NOT a full cross-check. The canonical
  // wording matrix lives in docs/reference/points-matrix.md, whose row labels are not
  // keyed by code and drift stylistically ("Co dirección" vs "Codirección"), so a
  // machine cross-check would be brittle rather than honest. Renamed so it stops
  // implying an oracle it doesn't have; label coverage is guarded above.
  it("spot-checks two representative label strings", () => {
    expect(POINT_RULE_LABELS.DirectProgram).toBe("Dirección de programa");
    expect(POINT_RULE_LABELS.PaymentPlanAdhesion).toBe("Adhesión a un plan de pago");
  });
});
