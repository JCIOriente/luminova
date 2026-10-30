import { describe, expect, it } from "vitest";
import { EXAMPLE_PROFILE, REPO_ROOT, loadProfile, type LoadedProfile } from "../load-profile.ts";
import { brandErrorOf, chapterProfile } from "../test-profiles.ts";
import { ciConfig, formatOutputs } from "./ci-config.ts";

const chapter: LoadedProfile = chapterProfile();

describe("ciConfig", () => {
  it("hands CD the profile, its project, its sign-in names and its hosting targets", () => {
    expect(formatOutputs(ciConfig(chapter))).toBe(
      [
        "profile=jci-valle",
        "project_id=jci-valle",
        "workload_identity_provider=projects/123456789012/locations/global/workloadIdentityPools/github-actions/providers/github-oidc",
        "service_account=firebase-deployer@jci-valle.iam.gserviceaccount.com",
        "spotlight_url=https://jcivalle.example.org",
        "spotlight_site=jcivalle",
        "backstage_site=jcivalle-backstage",
      ].join("\n"),
    );
  });

  it("stops without a deploy section, pointing at brand:provision", () => {
    const brand = structuredClone(chapter.brand);
    delete brand.deploy;
    const error = brandErrorOf(() => ciConfig({ ...chapter, brand }));
    expect(error.errors).toEqual([expect.stringMatching(/brand\.toml has no \[deploy\] table/)]);
    expect(error.remedies.map(({ run }) => run)).toEqual(["pnpm brand:provision"]);
  });

  it("applies the release rules: not the example, no environment override", () => {
    const example = loadProfile({ repoRoot: REPO_ROOT, profile: EXAMPLE_PROFILE });
    expect(brandErrorOf(() => ciConfig(example)).message).toMatch(/is the example/);
    expect(brandErrorOf(() => ciConfig({ ...chapter, source: "override" })).message).toMatch(
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
