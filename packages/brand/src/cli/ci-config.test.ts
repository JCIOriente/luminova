import { describe, expect, it } from "vitest";
import { BrandConfigError, REPO_ROOT, loadProfile, type LoadedProfile } from "../load-profile.ts";
import { ciConfig, formatOutputs } from "./ci-config.ts";

const jci: LoadedProfile = loadProfile({ repoRoot: REPO_ROOT, profile: "jci-oriente" });

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
  it("hands CD the profile, its project and its sign-in names", () => {
    expect(formatOutputs(ciConfig(jci))).toBe(
      [
        "profile=jci-oriente",
        "project_id=jci-oriente",
        "workload_identity_provider=projects/953870918238/locations/global/workloadIdentityPools/github-actions/providers/github-oidc",
        "service_account=firebase-deployer@jci-oriente.iam.gserviceaccount.com",
      ].join("\n"),
    );
  });

  it("stops without a deploy section, pointing at brand:provision", () => {
    const brand = structuredClone(jci.brand);
    delete brand.deploy;
    const error = errorsOf(() => ciConfig({ ...jci, brand }));
    expect(error.errors).toEqual([expect.stringMatching(/has no "deploy" section/)]);
    expect(error.remedies.map(({ run }) => run)).toEqual(["pnpm brand:provision"]);
  });

  it("applies the release rules: no fixture, no environment override", () => {
    const fixture = loadProfile({ repoRoot: REPO_ROOT, profile: "fixture" });
    expect(errorsOf(() => ciConfig(fixture)).message).toMatch(/neutral test profile/);
    expect(errorsOf(() => ciConfig({ ...jci, source: "override" })).message).toMatch(
      /set in your environment/,
    );
  });
});
