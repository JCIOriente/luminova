import { describe, expect, it } from "vitest";
import { foundedYear } from "virtual:luminova-brand";
import { siteContent } from "virtual:luminova-brand/site-content";
import { SITE_CONFIG_DEFAULTS, currentYearsActive } from "./defaults";

describe("site config defaults", () => {
  it("are the profile's site-content.json", () => {
    expect(SITE_CONFIG_DEFAULTS).toEqual(siteContent);
  });

  it("count the years active from the profile's founding year", () => {
    expect(currentYearsActive(new Date(2030, 5, 1))).toBe(2030 - foundedYear);
  });
});
