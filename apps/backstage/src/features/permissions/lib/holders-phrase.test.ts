import { describe, expect, it } from "vitest";
import { holdersPhrase } from "./holders-phrase";

describe("holdersPhrase", () => {
  it("pluralizes a known count", () => {
    expect(holdersPhrase(0)).toBe("0 miembros activos");
    expect(holdersPhrase(1)).toBe("1 miembro activo");
    expect(holdersPhrase(7)).toBe("7 miembros activos");
  });

  it("BLOCKING: never renders a degraded count as 0", () => {
    // null is "the members query did not resolve", which /permisos reaches on purpose —
    // it keeps the panel (and the only restore affordance) alive through a members outage.
    expect(holdersPhrase(null)).toMatch(/desconocido/);
    expect(holdersPhrase(null)).not.toMatch(/\b0\b/);
  });
});
