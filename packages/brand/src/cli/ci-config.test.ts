import { describe, expect, it } from "vitest";
import { EXAMPLE_PROFILE, REPO_ROOT, loadProfile, type LoadedProfile } from "../load-profile.ts";
import { brandErrorOf, localProfile } from "../test-profiles.ts";
import { ciConfig, formatOutputs } from "./ci-config.ts";

/** The test chapter in brand/local/, where CD's brand:pull put it. */
const pulled: LoadedProfile = localProfile();
/** What firebase-setup passes brand:ci-config: the validated FIREBASE_PROJECT_ID. */
const CD = { BRAND_CD_PROJECT: "jci-valle" };

describe("ciConfig", () => {
  it("hands CD the pulled profile's project and hosting targets, no sign-in", () => {
    expect(formatOutputs(ciConfig(pulled, CD))).toBe(
      [
        "project_id=jci-valle",
        "spotlight_url=https://jcivalle.example.org",
        "spotlight_site=jcivalle",
        "backstage_site=jcivalle-backstage",
      ].join("\n"),
    );
  });

  it("refuses a pulled brand.toml whose project is not FIREBASE_PROJECT_ID", () => {
    const error = brandErrorOf(() => ciConfig(pulled, { BRAND_CD_PROJECT: "jci-other" }));
    expect(error.errors).toEqual([
      'brand/local/brand.toml names project "jci-valle", but the repository variable FIREBASE_PROJECT_ID is "jci-other": CD deploys only the brand of the project it signed in to.',
    ]);
  });

  it("refuses to run outside CD, even with FIREBASE_PROJECT_ID in a member's shell", () => {
    for (const env of [{}, { BRAND_CD_PROJECT: " " }, { FIREBASE_PROJECT_ID: "jci-valle" }]) {
      expect(brandErrorOf(() => ciConfig(pulled, env)).errors).toEqual([
        "brand:ci-config runs in CD, after brand:pull: BRAND_CD_PROJECT is not set.",
      ]);
    }
  });

  it("refuses a profile brand:pull did not write, such as one named by its caller", () => {
    const committed = { ...pulled, slug: "jci-valle", source: "named" as const };
    expect(brandErrorOf(() => ciConfig(committed, CD)).errors).toEqual([
      'brand/ selects "jci-valle", not the brand/local/ brand:pull wrote: CD deploys only the brand pulled from the bucket.',
    ]);
  });

  it("applies the release rules: not the example, no environment override", () => {
    const example = loadProfile({ repoRoot: REPO_ROOT, profile: EXAMPLE_PROFILE });
    expect(
      brandErrorOf(() => ciConfig(example, { BRAND_CD_PROJECT: "demo-example" })).message,
    ).toMatch(/is the example/);
    expect(brandErrorOf(() => ciConfig({ ...pulled, source: "override" }, CD)).message).toMatch(
      /set in your environment/,
    );
  });
});

describe("formatOutputs", () => {
  it("refuses a value with a line break, which would add an output of its own", () => {
    for (const value of ["https://a.org\nproject_id=evil", "https://a.org\rproject_id=evil"]) {
      expect(() => formatOutputs({ spotlight_url: value })).toThrow(/spotlight_url.*line break/);
    }
  });
});
