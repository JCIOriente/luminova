import { describe, it, expect } from "vitest";
import { ALLY_CATEGORIES, ALLY_CATEGORY_LABELS } from "./ally-public.js";

describe("ally-public", () => {
  it("has 4 categories with a Spanish label each", () => {
    expect(ALLY_CATEGORIES).toEqual([
      "University",
      "PublicInstitution",
      "Organization",
      "Company",
    ]);
    for (const c of ALLY_CATEGORIES) expect(ALLY_CATEGORY_LABELS[c]).toMatch(/\S/);
  });
});
