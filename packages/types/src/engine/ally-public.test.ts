import { describe, it, expect } from "vitest";
import { ALLY_CATEGORIES, ALLY_CATEGORY_LABELS } from "./ally-public.js";

describe("ally-public", () => {
  it("labels exactly the categories that exist — no orphan or missing label", () => {
    expect(new Set(ALLY_CATEGORIES)).toEqual(new Set(Object.keys(ALLY_CATEGORY_LABELS)));
    for (const c of ALLY_CATEGORIES) expect(ALLY_CATEGORY_LABELS[c]).toMatch(/\S/);
  });
});
