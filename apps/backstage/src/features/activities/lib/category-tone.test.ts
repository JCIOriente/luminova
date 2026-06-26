import { describe, expect, it } from "vitest";
import { ACTIVITY_CATEGORIES } from "@luminova/types";
import { CATEGORY_TONE, TONE_COVER_BG, TONE_RIPPLE_COLOR } from "./category-tone";

describe("CATEGORY_TONE", () => {
  it("assigns a known cover tone to every category", () => {
    for (const category of ACTIVITY_CATEGORIES) {
      const tone = CATEGORY_TONE[category];
      expect(TONE_COVER_BG[tone]).toBeDefined();
      expect(TONE_RIPPLE_COLOR[tone]).toMatch(/^#/);
    }
  });
});
