import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { DEPLOY_SA, POOL_ID, PROVIDER_ID, attributeCondition } from "../deploy-identity.ts";
import { BrandConfigError, EXAMPLE_PROFILE, REPO_ROOT, loadProfile } from "../load-profile.ts";
import { localProfile } from "../test-profiles.ts";
import { CommandError, type CommandRunner } from "./gcloud.ts";
import {
  applyBucket,
  lookupDeployTarget,
  offerBucket,
  offerVariables,
  printProvisioning,
  provisionNext,
  provisioningSection,
} from "./provision.ts";

const BUCKET = "gs://jci-valle-brand-assets";
const SA = "firebase-deployer@jci-valle.iam.gserviceaccount.com";
const LIFECYCLE = JSON.parse(readFileSync(join(REPO_ROOT, "brand/bucket-lifecycle.json"), "utf8"));
const profile = localProfile();

const DONE = {
  name: "jci-valle-brand-assets",
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
  origin = "git@github.com:acme/luminova.git\n",
  canonical = "acme/luminova\n" as string | Error,
} = {}): CommandRunner {
  const states = [...describe];
  return async (command, args) => {
    calls.push([command, ...args]);
    const joined = args.join(" ");
    if (command === "gh" && joined.startsWith("api user")) return "123\n";
    if (command === "gh" && joined.startsWith("repo view")) {
      if (canonical instanceof Error) throw canonical;
      return canonical;
    }
    if (command === "git" && joined === `-C ${REPO_ROOT} remote get-url origin`) return origin;
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
      `gcloud storage buckets create ${BUCKET} --project=jci-valle --location=us-central1 --default-storage-class=STANDARD --uniform-bucket-level-access --public-access-prevention`,
    );
    expect(text).toContain(`gcloud storage buckets update ${BUCKET} --versioning`);
    expect(text).toContain(
      `gcloud storage buckets update ${BUCKET} --lifecycle-file=brand/bucket-lifecycle.json`,
    );
    expect(text).toContain(
      `gcloud storage buckets add-iam-policy-binding ${BUCKET} --member=serviceAccount:${SA} --role=roles/storage.objectViewer`,
    );
    expect(text).toContain("    pnpm brand:push\n");
    expect(text).toContain("gh workflow run deploy.yml -f surface=all --repo acme/luminova");
    expect(text).not.toMatch(/BRAND_PROFILE|\[deploy\]/);
    expect(mutations()).toEqual([]);
  });

  it("fills the docs/ci-cd.md section 6 block with project, number, repo and reviewer", async () => {
    const text = await printProvisioning({ profile, run: fakeRunner() });
    expect(text).toContain("export PROJECT_ID=jci-valle\n");
    expect(text).toContain("export PROJECT_NUMBER=42\n");
    expect(text).toContain("export GH_REPO=acme/luminova\n");
    expect(text).toContain("export REVIEWER_ID=123\n");
    expect(calls).toContainEqual(["gh", "api", "user", "-q", ".id"]);
    // The fork comes from the origin remote: gh's default repository is upstream in a clone
    // made with gh repo fork --clone.
    expect(calls).toContainEqual(["git", "-C", REPO_ROOT, "remote", "get-url", "origin"]);
    expect(calls.filter(([command, verb]) => command === "gh" && verb === "repo")).toEqual([
      ["gh", "repo", "view", "acme/luminova", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
    ]);
    expect(text).not.toMatch(/letter case/);
  });

  it("fills in GitHub's spelling of the fork, not origin's letter case", async () => {
    const text = await printProvisioning({
      profile,
      run: fakeRunner({ origin: "git@github.com:ACME/Luminova.git\n" }),
    });
    expect(text).toContain("export GH_REPO=acme/luminova\n");
    expect(text).not.toMatch(/ACME/);
  });

  it("notes, next to the repo it prints, when gh could not confirm its letter case", async () => {
    const text = await printProvisioning({
      profile,
      run: fakeRunner({
        origin: "git@github.com:ACME/Luminova.git\n",
        canonical: new CommandError("gh repo view failed: spawn gh ENOENT"),
      }),
    });
    expect(text).toContain("export GH_REPO=ACME/Luminova\n");
    expect(text).toMatch(
      /^Note: could not confirm the letter case of ACME\/Luminova with gh \(gh repo view ACME\/Luminova\); CD's keyless sign-in matches owner\/name case-sensitively, so write it as GitHub does\.$/m,
    );
  });

  it("warns when origin is upstream, and fills in no repository from it", async () => {
    const text = await printProvisioning({
      profile,
      run: fakeRunner({ origin: "https://github.com/JCIOriente/luminova.git\n" }),
    });
    expect(text).toMatch(
      /^Warning: the git remote origin is JCIOriente\/luminova, upstream, not your fork/m,
    );
    expect(text).not.toMatch(/--repo JCIOriente|GH_REPO=JCIOriente/);
    expect(text).toContain("export GH_REPO=   # FILL IN before pasting: git remote get-url origin");
  });

  it("leaves a hint for each value a lookup could not find", async () => {
    const failing: CommandRunner = async (command, args) => {
      calls.push([command, ...args]);
      throw new CommandError("offline");
    };
    const text = await printProvisioning({ profile, run: failing });
    expect(text).toContain(
      "export GH_REPO=   # FILL IN before pasting: git remote get-url origin (your fork, as owner/name)\n",
    );
    expect(text).toContain("export REVIEWER_ID=   # FILL IN before pasting: gh api user -q .id\n");
    expect(text).toContain(
      "export PROJECT_NUMBER=   # FILL IN before pasting: gcloud projects describe jci-valle",
    );
    expect(text).toMatch(/# PROJECT_NUMBER, GH_REPO, REVIEWER_ID could not be looked up\. Sign in/);
    // Nothing a shell would read as a redirection.
    expect(text).not.toMatch(/^\s*export \w+=</m);
  });

  it("orders the steps so CD's account exists before the bucket grants it read access", async () => {
    const text = await printProvisioning({ profile, run: fakeRunner() });
    const titles = [...text.matchAll(/^Step (\d) of 5: (.*)$/gm)].map(([, , title]) => title);
    expect(titles).toEqual([
      "create CD's deploy account and its keyless sign-in (once per project)",
      "tell CD where to deploy: two repository variables",
      "create the private bucket for your logos and icons",
      "upload your images",
      "first deploy",
    ]);
    expect(text.indexOf("iam service-accounts create")).toBeLessThan(
      text.indexOf("add-iam-policy-binding gs://"),
    );
  });

  it("prints the gh variable commands, filled in, instead of a [deploy] table", async () => {
    const text = await printProvisioning({ profile, run: fakeRunner() });
    expect(text).toContain(
      "    gh variable set FIREBASE_PROJECT_ID --body jci-valle --repo acme/luminova\n    gh variable set GCP_PROJECT_NUMBER --body 42 --repo acme/luminova\n",
    );
    expect(text).toContain("Check: gh variable list --repo acme/luminova");
  });

  it("looks nothing up again when given the project number and repository", async () => {
    const text = await printProvisioning({
      profile,
      run: fakeRunner(),
      target: { projectNumber: "77", ghRepo: "acme/fork" },
    });
    expect(text).toContain("gh variable set GCP_PROJECT_NUMBER --body 77 --repo acme/fork");
    expect(calls).toEqual([["gh", "api", "user", "-q", ".id"]]);
  });

  it("prints the provider's attribute condition, pinned to the fork and its main branch", async () => {
    const text = await printProvisioning({ profile, run: fakeRunner() });
    expect(text).toContain(
      "only acme/luminova's deploy.yml on main gets a token: assertion.repository == 'acme/luminova' && assertion.ref == 'refs/heads/main' && assertion.workflow_ref == 'acme/luminova/.github/workflows/deploy.yml@refs/heads/main'",
    );
    expect(text).toContain(
      `gcloud iam workload-identity-pools providers describe ${PROVIDER_ID} --project=jci-valle --location=global --workload-identity-pool=${POOL_ID} --format='value(attributeCondition)'`,
    );
  });

  it("leaves an unknown project number or repository as a commented line to fill in", async () => {
    const failing: CommandRunner = async (command, args) => {
      calls.push([command, ...args]);
      throw new CommandError("offline");
    };
    const text = await printProvisioning({ profile, run: failing });
    expect(text).toContain(
      "    # FILL IN, then run: gh variable set FIREBASE_PROJECT_ID --body jci-valle --repo <owner/name of your fork>   (git remote get-url origin)\n",
    );
    expect(text).toContain(
      "    # FILL IN, then run: gh variable set GCP_PROJECT_NUMBER --body <project number> --repo <owner/name of your fork>   (gcloud projects describe jci-valle --format='value(projectNumber)')",
    );
    expect(text).not.toMatch(/^ {4}gh variable set/m);
  });

  it("leaves only the project number to fill in when the repository is known", async () => {
    const text = await printProvisioning({
      profile,
      run: fakeRunner(),
      target: { projectNumber: null, ghRepo: "acme/luminova" },
    });
    expect(text).toContain(
      "    gh variable set FIREBASE_PROJECT_ID --body jci-valle --repo acme/luminova\n",
    );
    expect(text).toContain(
      "    # FILL IN, then run: gh variable set GCP_PROJECT_NUMBER --body <project number> --repo acme/luminova   (gcloud projects describe jci-valle --format='value(projectNumber)')",
    );
  });
});

describe("printProvisioning of a local-only profile", () => {
  it("refuses, pointing at connecting a project, without looking anything up", async () => {
    const local = { ...profile, localOnly: true };
    const error = await printProvisioning({ profile: local, run: fakeRunner() }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(BrandConfigError);
    expect((error as BrandConfigError).remedies.map(({ run }) => run)).toEqual(["pnpm brand:init"]);
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

  it("pins the provider's attribute condition to the fork's repository and main", () => {
    const block = provisioningSection(readFileSync(join(REPO_ROOT, "docs/ci-cd.md"), "utf8"));
    expect(block).toContain(`--attribute-condition="${attributeCondition("${GH_REPO}")}"`);
  });

  it("finds the section 6 block in the real docs/ci-cd.md and its four exports", () => {
    const block = provisioningSection(readFileSync(join(REPO_ROOT, "docs/ci-cd.md"), "utf8"));
    for (const key of ["PROJECT_ID", "PROJECT_NUMBER", "GH_REPO", "REVIEWER_ID"]) {
      expect(block).toMatch(new RegExp(`^export ${key}=`, "m"));
    }
  });
});

describe("applyBucket", () => {
  it("creates and configures a missing bucket, then grants the deploy SA read", async () => {
    const created = {
      name: "jci-valle-brand-assets",
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

  it("refuses the example", async () => {
    const example = loadProfile({ repoRoot: REPO_ROOT, profile: EXAMPLE_PROFILE });
    await expect(
      applyBucket({ profile: example, repoRoot: REPO_ROOT, run: fakeRunner() }),
    ).rejects.toThrow(/is the example/);
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

describe("offerBucket", () => {
  it("creates the bucket only when the answer is yes", async () => {
    const steps = await offerBucket({
      profile,
      repoRoot: REPO_ROOT,
      run: fakeRunner({ describe: [null, DONE] }),
      confirm: async () => true,
    });
    expect(steps?.[0]).toEqual({ label: "create the bucket", done: false });
    expect(mutations().map((call) => call.slice(1, 4).join(" "))).toContain(
      "storage buckets create",
    );
  });

  it("asks about step 3 after steps 1 and 2, and changes nothing on a no", async () => {
    const questions: string[] = [];
    const steps = await offerBucket({
      profile,
      repoRoot: REPO_ROOT,
      run: fakeRunner(),
      confirm: async (question) => {
        questions.push(question);
        return false;
      },
    });
    expect(steps).toBeNull();
    expect(questions).toEqual([
      "Steps 1 and 2 done? Then this can do step 3 now: create and set up the bucket (skips what is done). Do step 3 now?",
    ]);
    expect(calls).toEqual([]);
  });

  it("refuses a profile that cannot ship before asking", async () => {
    let asked = false;
    await expect(
      offerBucket({
        profile: { ...profile, source: "override" },
        repoRoot: REPO_ROOT,
        run: fakeRunner(),
        confirm: async () => {
          asked = true;
          return true;
        },
      }),
    ).rejects.toThrow(BrandConfigError);
    expect(asked).toBe(false);
    expect(calls).toEqual([]);
  });

  it("never asks or changes anything without a terminal", async () => {
    expect(await offerBucket({ profile, repoRoot: REPO_ROOT, run: fakeRunner() })).toBeNull();
    expect(calls).toEqual([]);
  });

  it("only prints without a terminal, even for a profile that cannot ship", async () => {
    expect(
      await offerBucket({
        profile: { ...profile, source: "override" },
        repoRoot: REPO_ROOT,
        run: fakeRunner(),
      }),
    ).toBeNull();
    expect(calls).toEqual([]);
  });
});

describe("offerVariables", () => {
  const sets = () => calls.filter(([command, , verb]) => command === "gh" && verb === "set");
  const target = { projectNumber: "42", ghRepo: "acme/luminova" };

  it("sets both repository variables only when the answer is yes, looking nothing up again", async () => {
    const questions: string[] = [];
    const result = await offerVariables({
      profile,
      target,
      run: fakeRunner(),
      confirm: async (question) => {
        questions.push(question);
        return true;
      },
    });
    expect(questions).toEqual([
      "Step 1 done? Then this can do step 2 now: set FIREBASE_PROJECT_ID=jci-valle and GCP_PROJECT_NUMBER=42 on acme/luminova. Do step 2 now?",
    ]);
    expect(result).toEqual({ set: true });
    expect(calls.filter(([, verb]) => verb !== "variable")).toEqual([]);
    expect(sets()).toEqual([
      [
        "gh",
        "variable",
        "set",
        "FIREBASE_PROJECT_ID",
        "--body",
        "jci-valle",
        "--repo",
        "acme/luminova",
      ],
      ["gh", "variable", "set", "GCP_PROJECT_NUMBER", "--body", "42", "--repo", "acme/luminova"],
    ]);
  });

  it("changes nothing on a no, which is the default", async () => {
    const result = await offerVariables({
      profile,
      target,
      run: fakeRunner(),
      confirm: async () => false,
    });
    expect(result).toEqual({ set: false, reason: null });
    expect(sets()).toEqual([]);
  });

  it("never asks or changes anything without a terminal", async () => {
    expect(await offerVariables({ profile, target, run: fakeRunner() })).toEqual({
      set: false,
      reason: null,
    });
    expect(calls).toEqual([]);
  });

  it("does not ask when the project number or repository is unknown, and says why", async () => {
    let asked = false;
    const confirm = async () => {
      asked = true;
      return true;
    };
    const run = fakeRunner();
    expect(
      await offerVariables({ profile, target: { ...target, projectNumber: null }, run, confirm }),
    ).toEqual({
      set: false,
      reason:
        "the project number of jci-valle could not be looked up (gcloud projects describe jci-valle --format='value(projectNumber)')",
    });
    expect(
      await offerVariables({ profile, target: { ...target, ghRepo: null }, run, confirm }),
    ).toEqual({
      set: false,
      reason: "your fork could not be read from the git remote origin (git remote get-url origin)",
    });
    expect(
      await offerVariables({
        profile,
        target: { projectNumber: null, ghRepo: null },
        run,
        confirm,
      }),
    ).toEqual({
      set: false,
      reason: expect.stringMatching(/project number .* and your fork could not be read/),
    });
    expect(
      await offerVariables({
        profile,
        target: { ...target, ghRepo: null, warning: "the git remote origin is upstream" },
        run,
        confirm,
      }),
    ).toEqual({ set: false, reason: "the git remote origin is upstream" });
    expect(asked).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe("lookupDeployTarget", () => {
  it("looks up the project number and the fork once each", async () => {
    expect(await lookupDeployTarget({ profile, repoRoot: REPO_ROOT, run: fakeRunner() })).toEqual({
      projectNumber: "42",
      ghRepo: "acme/luminova",
      warning: null,
      caseNote: null,
    });
    expect(calls).toEqual([
      ["gcloud", "projects", "describe", "jci-valle", "--format=value(projectNumber)"],
      ["git", "-C", REPO_ROOT, "remote", "get-url", "origin"],
      ["gh", "repo", "view", "acme/luminova", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
    ]);
  });

  it("treats an upstream origin as no fork, with a warning to print", async () => {
    const target = await lookupDeployTarget({
      profile,
      repoRoot: REPO_ROOT,
      run: fakeRunner({ origin: "https://github.com/JCIOriente/luminova\n" }),
    });
    expect(target.ghRepo).toBeNull();
    expect(target.warning).toMatch(/upstream, not your fork/);
  });
});

describe("provisionNext", () => {
  it("after printing, says to come back and answer y once steps 1 and 2 are done", () => {
    expect(provisionNext({ applied: false })).toEqual([
      expect.objectContaining({
        change: expect.stringMatching(/answer y/),
        run: "pnpm brand:provision",
      }),
    ]);
  });

  it("after creating the bucket, points at the upload and the check", () => {
    expect(provisionNext({ applied: true }).map(({ run }) => run)).toEqual([
      "pnpm brand:push",
      "pnpm brand:check",
    ]);
  });
});
