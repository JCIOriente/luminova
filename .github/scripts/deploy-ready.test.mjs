/** Fixture tests for deploy-ready.sh, the check that lets an unprepared fork skip Deploy.
 *
 *  Run: node --test .github/scripts/deploy-ready.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
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
const EXAMPLE = { firebase: { projectId: "demo-example" } };
/** The example's old name, still in the base tree of the first deploy after the rename (D12). */
const FIXTURE = { firebase: { projectId: "demo-fixture" } };
/** A fork: the committed example, plus its chapter. */
const fork = (acme, more = {}) => repo({ example: EXAMPLE, acme, ...more });

const check = (root) => spawnSync("bash", [SCRIPT, root], { encoding: "utf8" });

test("a profile on a real project with a deploy section is ready", () => {
  const r = check(fork(READY));
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "project=acme\nready=true\n");
});

test("a clone with no chapter profile selects the example, which never deploys", () => {
  const r = check(repo({ example: EXAMPLE, notes: null }));
  assert.equal(r.status, 0);
  assert.match(
    r.stdout,
    /^project=demo-example\nready=false\nreason=profile "example" is local-only/,
  );
});

test("the old fixture beside one chapter is no second chapter (D12)", () => {
  const before = { "jci-oriente": READY, fixture: FIXTURE };
  assert.equal(check(repo(before)).stdout, "project=acme\nready=true\n");
  assert.equal(check(repo({ ...before, example: EXAMPLE })).stdout, "project=acme\nready=true\n");
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
  assert.match(r.stdout, /connect it with pnpm brand:init,/);
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

test("counts folders as Node does: no symlinks, dot-folders included", () => {
  const linked = fork(READY);
  const elsewhere = mkdtempSync(join(tmpdir(), "deploy-ready-elsewhere-"));
  writeFileSync(join(elsewhere, "brand.json"), JSON.stringify(READY));
  symlinkSync(elsewhere, join(linked, "brand", "jci-valle"));
  assert.equal(check(linked).stdout, "project=acme\nready=true\n");
  const hidden = check(fork(READY, { ".valle": READY, "..urku": READY }));
  assert.equal(hidden.status, 1);
  assert.match(hidden.stderr, /3 chapter profiles \(\.\.urku, \.valle, acme\)/);
});

test("reads a ref's folder names unquoted", () => {
  const root = fork(READY, { 'jci-va"lle': READY });
  // A file whose name looks like an ls-tree type is no folder.
  writeFileSync(join(root, "brand", "x tree y"), "{}");
  const git = (...args) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  git("init", "-q");
  git("add", "-A");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "c");
  const at = spawnSync("bash", [SCRIPT, root, "HEAD"], { encoding: "utf8" });
  assert.equal(at.status, 1);
  assert.match(at.stderr, /2 chapter profiles \(acme, jci-va"lle\)/);
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
  assert.match(at("HEAD"), /^project=demo-example\nready=false\n/);
  assert.equal(at("HEAD~1"), "project=acme\nready=true\n");
});

test("names the example as the TypeScript twin does", () => {
  const loader = readFileSync(
    join(dirname(SCRIPT), "..", "..", "packages", "brand", "src", "load-profile.ts"),
    "utf8",
  );
  const script = readFileSync(SCRIPT, "utf8");
  const constant = (name) => loader.match(new RegExp(`export const ${name} = "([^"]+)"`))?.[1];
  assert.equal(script.match(/^example=(\S+)$/m)?.[1], constant("EXAMPLE_PROFILE"));
});

test("the committed profile is ready to deploy", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  assert.match(check(root).stdout, /^project=jci-oriente\nready=true\n$/);
});
