/** Fixture tests for deploy-ready.sh, which reads CD's target and sign-in from the
 *  repository variables and lets a fork that has not set them skip Deploy.
 *
 *  Run: node --test .github/scripts/deploy-ready.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEPLOY_SA,
  POOL_ID,
  PROJECT_NUMBER_PATTERN,
  PROVIDER_ID,
  deployIdentity,
} from "../../packages/brand/src/deploy-identity.ts";
import { PROJECT_ID_PATTERN } from "../../packages/brand/src/schema.ts";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "deploy-ready.sh");
const VARIABLES = [
  "FIREBASE_PROJECT_ID",
  "GCP_PROJECT_NUMBER",
  "GCP_REGION",
  "WIF_PROVIDER",
  "DEPLOY_SA",
];

/** Runs the script with only `vars` set among the five variables, in an empty directory. */
function check(vars = {}) {
  const env = { ...process.env };
  for (const name of VARIABLES) delete env[name];
  return spawnSync("bash", [SCRIPT], {
    encoding: "utf8",
    cwd: mkdtempSync(join(tmpdir(), "deploy-ready-")),
    env: { ...env, ...vars },
  });
}

/** The script's `key=value` lines as an object. */
const outputs = (stdout) =>
  Object.fromEntries(
    stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
  );

const ACME = { FIREBASE_PROJECT_ID: "acme-prod", GCP_PROJECT_NUMBER: "123456789012" };

test("both required variables set: ready, with the sign-in derived from them", () => {
  const r = check(ACME);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(outputs(r.stdout), {
    project: "acme-prod",
    ready: "true",
    project_number: "123456789012",
    region: "us-central1",
    workload_identity_provider:
      "projects/123456789012/locations/global/workloadIdentityPools/github-actions/providers/github-oidc",
    service_account: "firebase-deployer@acme-prod.iam.gserviceaccount.com",
  });
});

test("derives the same provider and account as brand:provision creates (one source of truth)", () => {
  const out = outputs(check(ACME).stdout);
  const expected = deployIdentity({ projectId: "acme-prod", projectNumber: "123456789012" });
  assert.equal(out.workload_identity_provider, expected.workloadIdentityProvider);
  assert.equal(out.service_account, expected.serviceAccount);
  // The names themselves, so a rename on either side shows here.
  assert.deepEqual(
    [DEPLOY_SA, POOL_ID, PROVIDER_ID],
    ["firebase-deployer", "github-actions", "github-oidc"],
  );
});

test("checks the project id and number with the patterns brand:check and brand:pull use", () => {
  const script = readFileSync(SCRIPT, "utf8");
  const pattern = (name) => script.match(new RegExp(`^${name}='([^']*)'$`, "m"))?.[1];
  assert.equal(pattern("project_re"), PROJECT_ID_PATTERN.source);
  assert.equal(pattern("number_re"), PROJECT_NUMBER_PATTERN.source);
});

test("JCI Oriente's two variables sign in exactly as its [deploy] table did", () => {
  const out = outputs(
    check({ FIREBASE_PROJECT_ID: "jci-oriente", GCP_PROJECT_NUMBER: "953870918238" }).stdout,
  );
  assert.equal(out.ready, "true");
  assert.equal(
    out.workload_identity_provider,
    "projects/953870918238/locations/global/workloadIdentityPools/github-actions/providers/github-oidc",
  );
  assert.equal(out.service_account, "firebase-deployer@jci-oriente.iam.gserviceaccount.com");
});

test("the optional variables override the region, provider and account", () => {
  const out = outputs(
    check({
      ...ACME,
      GCP_REGION: "europe-west1",
      WIF_PROVIDER: "projects/42/locations/global/workloadIdentityPools/ci-pool/providers/gh",
      DEPLOY_SA: "deployer@acme-ops.iam.gserviceaccount.com",
    }).stdout,
  );
  assert.equal(out.region, "europe-west1");
  assert.equal(
    out.workload_identity_provider,
    "projects/42/locations/global/workloadIdentityPools/ci-pool/providers/gh",
  );
  assert.equal(out.service_account, "deployer@acme-ops.iam.gserviceaccount.com");
});

test("a missing required variable skips, naming it and the gh command that sets it", () => {
  for (const [vars, missing] of [
    [{}, ["FIREBASE_PROJECT_ID", "GCP_PROJECT_NUMBER"]],
    [{ GCP_PROJECT_NUMBER: "123456789012" }, ["FIREBASE_PROJECT_ID"]],
    [{ FIREBASE_PROJECT_ID: "acme-prod" }, ["GCP_PROJECT_NUMBER"]],
    [
      { FIREBASE_PROJECT_ID: "", GCP_PROJECT_NUMBER: "" },
      ["FIREBASE_PROJECT_ID", "GCP_PROJECT_NUMBER"],
    ],
  ]) {
    const r = check(vars);
    assert.equal(r.status, 0, r.stderr);
    const out = outputs(r.stdout);
    assert.equal(out.ready, "false");
    assert.equal(out.project, vars.FIREBASE_PROJECT_ID ?? "");
    assert.equal(out.workload_identity_provider, undefined);
    for (const name of missing) {
      assert.match(out.reason, new RegExp(`gh variable set ${name} --body `));
    }
    assert.match(out.reason, new RegExp(`repository variable.* ${missing.join(", ")} `));
    assert.equal(r.stdout.split("\n").filter(Boolean).length, 3, "reason is one line");
  }
});

test("a demo- project is local-only and skips, naming the way to go live", () => {
  const r = check({ FIREBASE_PROJECT_ID: "demo-acme", GCP_PROJECT_NUMBER: "123456789012" });
  assert.equal(r.status, 0);
  const out = outputs(r.stdout);
  assert.equal(out.project, "demo-acme");
  assert.equal(out.ready, "false");
  assert.match(
    out.reason,
    /demo-acme.*exists only in the emulators.*gh variable set FIREBASE_PROJECT_ID --body/,
  );
});

test("an invalid variable fails the run loudly instead of skipping or deploying", () => {
  for (const [vars, name] of [
    [{ ...ACME, FIREBASE_PROJECT_ID: "Acme_Prod" }, "FIREBASE_PROJECT_ID"],
    [
      { ...ACME, FIREBASE_PROJECT_ID: "acme-prod\nservice_account=evil@x.iam.gserviceaccount.com" },
      "FIREBASE_PROJECT_ID",
    ],
    [{ ...ACME, FIREBASE_PROJECT_ID: " acme-prod" }, "FIREBASE_PROJECT_ID"],
    [{ ...ACME, GCP_PROJECT_NUMBER: "12345-6789" }, "GCP_PROJECT_NUMBER"],
    [{ ...ACME, GCP_PROJECT_NUMBER: "acme-prod" }, "GCP_PROJECT_NUMBER"],
    [{ ...ACME, GCP_PROJECT_NUMBER: "123\n456" }, "GCP_PROJECT_NUMBER"],
    [{ ...ACME, GCP_REGION: "us central1" }, "GCP_REGION"],
    [
      { ...ACME, WIF_PROVIDER: "projects/x/locations/global/workloadIdentityPools/p/providers/q" },
      "WIF_PROVIDER",
    ],
    [{ ...ACME, WIF_PROVIDER: "github-oidc" }, "WIF_PROVIDER"],
    [{ ...ACME, DEPLOY_SA: "firebase-deployer" }, "DEPLOY_SA"],
    [{ ...ACME, DEPLOY_SA: "someone@gmail.com" }, "DEPLOY_SA"],
    // Invalid even when the other required one is missing: a typo is never "not set up".
    [{ GCP_PROJECT_NUMBER: "twelve" }, "GCP_PROJECT_NUMBER"],
  ]) {
    const r = check(vars);
    assert.equal(r.status, 1, `${name}: ${r.stdout}`);
    assert.equal(r.stdout, "");
    assert.match(r.stderr, new RegExp(`repository variable ${name}`));
  }
});

test("reads no brand files: the same answer whatever the directory holds", () => {
  const script = spawnSync("cat", [SCRIPT], { encoding: "utf8" }).stdout;
  assert.doesNotMatch(script, /brand\.toml|brand\.json|jq |awk /);
});
