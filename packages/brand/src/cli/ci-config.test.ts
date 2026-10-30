import { describe, expect, it } from "vitest";
import {
  BrandConfigError,
  EXAMPLE_PROFILE,
  REPO_ROOT,
  loadProfile,
  type LoadedProfile,
} from "../load-profile.ts";
import { chapterProfile } from "../test-profiles.ts";
import { ciConfig, formatOutputs } from "./ci-config.ts";

const chapter: LoadedProfile = chapterProfile();

function errorsOf(run: () => unknown): BrandConfigError {
  try {
    run();
  } catch (error) {
    if (error instanceof BrandConfigError) return error;
    throw error;
  }
  throw new Error("expected a BrandConfigError");
}

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
    const error = errorsOf(() => ciConfig({ ...chapter, brand }));
    expect(error.errors).toEqual([expect.stringMatching(/brand\.toml has no \[deploy\] table/)]);
    expect(error.remedies.map(({ run }) => run)).toEqual(["pnpm brand:provision"]);
  });

  it("applies the release rules: not the example, no environment override", () => {
    const example = loadProfile({ repoRoot: REPO_ROOT, profile: EXAMPLE_PROFILE });
    expect(errorsOf(() => ciConfig(example)).message).toMatch(/is the example/);
    expect(errorsOf(() => ciConfig({ ...chapter, source: "override" })).message).toMatch(
      /set in your environment/,
    );
  });
});
