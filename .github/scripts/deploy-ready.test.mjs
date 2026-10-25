/** Fixture tests for deploy-ready.sh, the check that lets an unprepared fork skip Deploy.
 *
 *  Run: node --test .github/scripts/deploy-ready.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "deploy-ready.sh");

const DEPLOY = {
  workloadIdentityProvider: "projects/1/locations/global/workloadIdentityPools/p/providers/q",
  serviceAccount: "firebase-deployer@acme.iam.gserviceaccount.com",
};

/** A repo root whose brand/ holds `profiles` (folder -> brand.json, or null for a folder without one). */
function repo(profiles) {
  const root = mkdtempSync(join(tmpdir(), "deploy-ready-"));
  mkdirSync(join(root, "brand"));
  writeFileSync(join(root, "brand", "brand.schema.json"), "{}");
  for (const [folder, brand] of Object.entries(profiles)) {
    mkdirSync(join(root, "brand", folder));
    if (brand !== null) {
      writeFileSync(join(root, "brand", folder, "brand.json"), JSON.stringify(brand));
    }
  }
  return root;
}

const READY = { firebase: { projectId: "acme" }, deploy: DEPLOY };
const EXAMPLE = { firebase: { projectId: "jci-oriente" }, deploy: DEPLOY };
const FIXTURE = { firebase: { projectId: "demo-fixture" } };
/** A fork: the committed example and fixture, plus its chapter. */
const fork = (acme, more = {}) => repo({ "jci-oriente": EXAMPLE, fixture: FIXTURE, acme, ...more });

const check = (root) => spawnSync("bash", [SCRIPT, root], { encoding: "utf8" });

test("a profile on a real project with a deploy section is ready", () => {
  const r = check(fork(READY));
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "project=acme\nready=true\n");
});

test("upstream, with no chapter profile, deploys the example", () => {
  const r = check(repo({ "jci-oriente": EXAMPLE, fixture: FIXTURE, notes: null }));
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "project=jci-oriente\nready=true\n");
});

test("a chapter profile wins without the example beside it", () => {
  assert.equal(check(repo({ acme: READY })).stdout, "project=acme\nready=true\n");
});

test("a local-only profile skips, naming the way to go live", () => {
  const r = check(fork({ firebase: { projectId: "demo-acme" } }));
  assert.equal(r.status, 0);
  assert.match(
    r.stdout,
    /^project=demo-acme\nready=false\nreason=profile "acme" is local-only \(project demo-acme\)/,
  );
  assert.match(r.stdout, /pnpm brand:init --connect/);
});

test("a real project without a deploy section skips, pointing at brand:provision", () => {
  for (const deploy of [undefined, { serviceAccount: DEPLOY.serviceAccount }]) {
    const r = check(fork({ firebase: { projectId: "acme" }, deploy }));
    assert.equal(r.status, 0);
    assert.match(
      r.stdout,
      /^project=acme\nready=false\nreason=.*no "deploy" section.*pnpm brand:provision/,
    );
  }
});

test("a broken selection fails loudly instead of skipping", () => {
  for (const [root, error] of [
    [
      fork(READY, { "jci-andina": READY }),
      /brand\/ holds 2 chapter profiles \(acme, jci-andina\); a repository builds one$/m,
    ],
    [repo({ fixture: FIXTURE }), /brand\/ holds no profile/],
    [repo({ Acme_Chapter: READY }), /brand\/Acme_Chapter\/ must be named with lowercase/],
  ]) {
    const r = check(root);
    assert.equal(r.status, 1, r.stdout);
    assert.equal(r.stdout, "");
    assert.match(r.stderr, error);
  }
});

test("judges a past commit with a git ref", () => {
  const root = fork({ firebase: { projectId: "demo-acme" } });
  const git = (...args) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  const commit = () => {
    git("add", "-A");
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "c");
  };
  git("init", "-q");
  commit();
  writeFileSync(join(root, "brand", "acme", "brand.json"), JSON.stringify(READY));
  assert.equal(check(root).stdout, "project=acme\nready=true\n");
  const at = (ref) => spawnSync("bash", [SCRIPT, root, ref], { encoding: "utf8" }).stdout;
  assert.match(at("HEAD"), /^project=demo-acme\nready=false\n/);
  // Once the chapter folder is gone, brand/ selects the example again: another project.
  commit();
  git("rm", "-rq", "brand/acme");
  commit();
  writeFileSync(join(root, "brand", "untracked.json"), "{}");
  assert.equal(at("HEAD"), "project=jci-oriente\nready=true\n");
  assert.equal(at("HEAD~1"), "project=acme\nready=true\n");
});

test("names the example and the fixture as the TypeScript twin does", () => {
  const loader = readFileSync(
    join(dirname(SCRIPT), "..", "..", "packages", "brand", "src", "load-profile.ts"),
    "utf8",
  );
  const script = readFileSync(SCRIPT, "utf8");
  const constant = (name) => loader.match(new RegExp(`export const ${name} = "([^"]+)"`))?.[1];
  assert.equal(script.match(/^example=(\S+)$/m)?.[1], constant("EXAMPLE_PROFILE"));
  assert.match(script, new RegExp(`case "\\$name" in "" \\| ${constant("NEUTRAL_PROFILE")} \\|`));
});

test("the committed profile is ready to deploy", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  assert.match(check(root).stdout, /^project=jci-oriente\nready=true\n$/);
});
