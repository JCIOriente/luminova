import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { DEPLOY_SA, POOL_ID, PROVIDER_ID } from "../deploy-identity.ts";
import { BrandConfigError, REPO_ROOT, loadProfile, type LoadedProfile } from "../load-profile.ts";
import { CommandError, type CommandRunner } from "./gcloud.ts";
import { applyBucket, printProvisioning, provisionNext, provisioningSection } from "./provision.ts";

const BUCKET = "gs://jci-oriente-brand-assets";
const SA = "firebase-deployer@jci-oriente.iam.gserviceaccount.com";
const LIFECYCLE = JSON.parse(readFileSync(join(REPO_ROOT, "brand/bucket-lifecycle.json"), "utf8"));
const profile: LoadedProfile = {
  ...loadProfile({ repoRoot: REPO_ROOT, profile: "jci-oriente" }),
  source: "example",
};

const DONE = {
  name: "jci-oriente-brand-assets",
  uniform_bucket_level_access: true,
  public_access_prevention: "enforced",
  versioning_enabled: true,
  lifecycle_config: LIFECYCLE.lifecycle,
};
const GRANTED = {
  bindings: [{ role: "roles/storage.objectViewer", members: [`serviceAccount:${SA}`] }],
};

let calls: string[][];

/** describe answers come from a queue, so a test can model the bucket before and after create. */
function fakeRunner({
  describe = [DONE] as (object | null)[],
  policy = GRANTED as object,
} = {}): CommandRunner {
  const states = [...describe];
  return async (command, args) => {
    calls.push([command, ...args]);
    const joined = args.join(" ");
    if (command === "gh" && joined.startsWith("api user")) return "123\n";
    if (command === "gh" && joined.startsWith("repo view")) return "acme/luminova\n";
    if (joined.startsWith("projects describe")) return "42\n";
    if (joined.startsWith("storage buckets describe")) {
      const state = states.length > 1 ? states.shift() : states[0];
      if (!state) throw new CommandError("gcloud storage buckets describe failed: not found");
      return JSON.stringify(state);
    }
    if (joined.startsWith("storage buckets get-iam-policy")) return JSON.stringify(policy);
    return "";
  };
}

const mutations = () =>
  calls.filter(
    ([command, ...args]) =>
      command === "gcloud" &&
      /^storage buckets (create|update|add-iam-policy-binding)/.test(args.join(" ")),
  );

beforeEach(() => {
  calls = [];
});

describe("printProvisioning", () => {
  it("prints part B with the profile's values and changes nothing", async () => {
    const text = await printProvisioning({ profile, run: fakeRunner() });
    expect(text).toContain(
      `gcloud storage buckets create ${BUCKET} --project=jci-oriente --location=us-central1 --default-storage-class=STANDARD --uniform-bucket-level-access --public-access-prevention`,
    );
    expect(text).toContain(`gcloud storage buckets update ${BUCKET} --versioning`);
    expect(text).toContain(
      `gcloud storage buckets update ${BUCKET} --lifecycle-file=brand/bucket-lifecycle.json`,
    );
    expect(text).toContain(
      `gcloud storage buckets add-iam-policy-binding ${BUCKET} --member=serviceAccount:${SA} --role=roles/storage.objectViewer`,
    );
    expect(text).toContain("pnpm brand:push --from brand/jci-oriente/assets");
    expect(text).toContain("gh workflow run deploy.yml -f surface=all");
    expect(text).not.toMatch(/BRAND_PROFILE|gh variable/);
    expect(mutations()).toEqual([]);
  });

  it("fills the docs/ci-cd.md section 6 block with project, number, repo and reviewer", async () => {
    const text = await printProvisioning({ profile, run: fakeRunner() });
    expect(text).toContain("export PROJECT_ID=jci-oriente\n");
    expect(text).toContain("export PROJECT_NUMBER=42\n");
    expect(text).toContain("export GH_REPO=acme/luminova\n");
    expect(text).toContain("export REVIEWER_ID=123\n");
    expect(calls).toContainEqual(["gh", "api", "user", "-q", ".id"]);
  });

  it("prefers --repo over gh and leaves a hint when a lookup fails", async () => {
    const failing: CommandRunner = async (command, args) => {
      calls.push([command, ...args]);
      throw new CommandError("offline");
    };
    const text = await printProvisioning({ profile, run: failing, repo: "me/fork" });
    expect(text).toContain("export GH_REPO=me/fork\n");
    expect(text).toContain("export REVIEWER_ID=   # FILL IN before pasting: gh api user -q .id\n");
    expect(text).toContain(
      "export PROJECT_NUMBER=   # FILL IN before pasting: gcloud projects describe jci-oriente",
    );
    expect(text).toMatch(/# PROJECT_NUMBER, REVIEWER_ID could not be looked up\. Sign in/);
    // Nothing a shell would read as a redirection.
    expect(text).not.toMatch(/^\s*export \w+=</m);
  });

  it("orders the steps so CD's account exists before the bucket grants it read access", async () => {
    const text = await printProvisioning({ profile, run: fakeRunner() });
    const titles = [...text.matchAll(/^Step (\d) of 5: (.*)$/gm)].map(([, , title]) => title);
    expect(titles).toEqual([
      "create CD's deploy account and its keyless sign-in (once per project)",
      "tell CD which account to use (done: brand/jci-oriente/brand.json has it)",
      "create the private bucket for your logos and icons",
      "upload your images",
      "first deploy",
    ]);
    expect(text.indexOf("iam service-accounts create")).toBeLessThan(
      text.indexOf("add-iam-policy-binding gs://"),
    );
  });

  it("prints the deploy section to paste, from the project number, when the profile lacks it", async () => {
    const brand = structuredClone(profile.brand);
    delete brand.deploy;
    const text = await printProvisioning({ profile: { ...profile, brand }, run: fakeRunner() });
    expect(text).toContain(
      '"workloadIdentityProvider": "projects/42/locations/global/workloadIdentityPools/github-actions/providers/github-oidc"',
    );
    expect(text).toContain(`"serviceAccount": "${SA}"`);
    expect(text).toMatch(/^Step 2 of 5: tell CD which account to use$/m);
  });
});

describe("printProvisioning of a local-only profile", () => {
  it("refuses, pointing at --connect, without looking anything up", async () => {
    const fixture = loadProfile({ repoRoot: REPO_ROOT, profile: "fixture" });
    const error = await printProvisioning({ profile: fixture, run: fakeRunner() }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(BrandConfigError);
    expect((error as BrandConfigError).remedies.map(({ run }) => run)).toEqual([
      "pnpm brand:init --connect",
    ]);
    expect(calls).toEqual([]);
  });
});

describe("provisioningSection", () => {
  it("names the same deploy account, pool and provider brand:init writes into deploy", () => {
    const block = provisioningSection(readFileSync(join(REPO_ROOT, "docs/ci-cd.md"), "utf8"));
    for (const [key, value] of Object.entries({ DEPLOY_SA, POOL_ID, PROVIDER_ID })) {
      expect(block).toMatch(new RegExp(`^export ${key}=${value}$`, "m"));
    }
  });

  it("finds the section 6 block in the real docs/ci-cd.md and its four exports", () => {
    const block = provisioningSection(readFileSync(join(REPO_ROOT, "docs/ci-cd.md"), "utf8"));
    for (const key of ["PROJECT_ID", "PROJECT_NUMBER", "GH_REPO", "REVIEWER_ID"]) {
      expect(block).toMatch(new RegExp(`^export ${key}=`, "m"));
    }
  });
});

describe("applyBucket", () => {
  it("grants read access to the account the profile's deploy section names", async () => {
    const custom = "deployer@jci-oriente.iam.gserviceaccount.com";
    const brand = structuredClone(profile.brand);
    brand.deploy = {
      workloadIdentityProvider: brand.deploy?.workloadIdentityProvider ?? "",
      serviceAccount: custom,
    };
    await applyBucket({
      profile: { ...profile, brand },
      repoRoot: REPO_ROOT,
      run: fakeRunner({ policy: { bindings: [] } }),
    });
    expect(mutations()).toContainEqual([
      "gcloud",
      "storage",
      "buckets",
      "add-iam-policy-binding",
      BUCKET,
      `--member=serviceAccount:${custom}`,
      "--role=roles/storage.objectViewer",
    ]);
  });

  it("creates and configures a missing bucket, then grants the deploy SA read", async () => {
    const created = {
      name: "jci-oriente-brand-assets",
      uniform_bucket_level_access: true,
      public_access_prevention: "enforced",
    };
    const steps = await applyBucket({
      profile,
      repoRoot: REPO_ROOT,
      run: fakeRunner({ describe: [null, created], policy: { bindings: [] } }),
    });
    expect(steps.map(({ label, done }) => [label, done])).toEqual([
      ["create the bucket", false],
      ["private (no public access)", true],
      ["keep old versions (for rollback)", false],
      ["keep the last 3 old versions of each file", false],
      ["let the deploy account read it", false],
    ]);
    expect(mutations().map((call) => call.slice(1, 4).join(" "))).toEqual([
      "storage buckets create",
      "storage buckets update",
      "storage buckets update",
      "storage buckets add-iam-policy-binding",
    ]);
    expect(mutations()[2]).toContain(
      `--lifecycle-file=${join(REPO_ROOT, "brand/bucket-lifecycle.json")}`,
    );
  });

  it("changes nothing on a bucket that is already provisioned", async () => {
    const steps = await applyBucket({ profile, repoRoot: REPO_ROOT, run: fakeRunner() });
    expect(steps.every(({ done }) => done)).toBe(true);
    expect(mutations()).toEqual([]);
  });

  it("hardens an existing bucket that allows public access", async () => {
    await applyBucket({
      profile,
      repoRoot: REPO_ROOT,
      run: fakeRunner({ describe: [{ ...DONE, public_access_prevention: "inherited" }] }),
    });
    expect(mutations()).toEqual([
      [
        "gcloud",
        "storage",
        "buckets",
        "update",
        BUCKET,
        "--uniform-bucket-level-access",
        "--public-access-prevention",
      ],
    ]);
  });

  it("refuses the fixture profile", async () => {
    const fixture: LoadedProfile = {
      ...loadProfile({ repoRoot: REPO_ROOT, profile: "fixture" }),
      source: "example",
    };
    await expect(
      applyBucket({ profile: fixture, repoRoot: REPO_ROOT, run: fakeRunner() }),
    ).rejects.toThrow(/neutral test profile/);
    expect(calls).toEqual([]);
  });

  it("refuses a profile chosen by an environment override", async () => {
    await expect(
      applyBucket({
        profile: { ...profile, source: "override" },
        repoRoot: REPO_ROOT,
        run: fakeRunner(),
      }),
    ).rejects.toThrow(BrandConfigError);
    expect(calls).toEqual([]);
  });
});

describe("provisionNext", () => {
  it("after printing, points at --apply", () => {
    expect(provisionNext({ applied: false }).map(({ run }) => run)).toEqual([
      "pnpm brand:provision --apply",
    ]);
  });

  it("after applying, points at the upload and doctor", () => {
    expect(
      provisionNext({ applied: true, pushCommand: "pnpm brand:push" }).map(({ run }) => run),
    ).toEqual(["pnpm brand:push", "pnpm brand:doctor"]);
  });
});
