import { describe, expect, it } from "vitest";
import { SITE_CONFIG_CONTENT } from "../../../../tools/scripts/lib/site-config-seed-data.mjs";
import { SITE_CONFIG_DEFAULTS } from "./defaults";

// The seed is plain Node and cannot import this TS module, so it holds a second copy of the
// same facts. Both feed what a visitor reads: drift would show old copy on a fresh emulator.
describe("site config seed mirrors the spotlight defaults", () => {
  it.each(["stats", "timeline", "mvv", "reasons", "contact"] as const)("%s", (key) => {
    expect(SITE_CONFIG_CONTENT[key]).toEqual(SITE_CONFIG_DEFAULTS[key]);
  });
});
