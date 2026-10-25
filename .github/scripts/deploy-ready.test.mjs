/** Fixture tests for deploy-ready.sh, the check that lets an unprepared fork skip Deploy.
 *
 *  Run: node --test .github/scripts/deploy-ready.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "deploy-ready.sh");

const DEPLOY = {
  workloadIdentityProvider: "projects/1/locations/global/workloadIdentityPools/p/providers/q",
  serviceAccount: "firebase-deployer@acme.iam.gserviceaccount.com",
};

/** A repo root with luminova.json selecting `profile`, whose brand.json holds `brand`. */
function repo({ config = { profile: "acme" }, brand = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), "deploy-ready-"));
  if (config !== null) writeFileSync(join(root, "luminova.json"), JSON.stringify(config));
  if (brand !== null) {
    mkdirSync(join(root, "brand", "acme"), { recursive: true });
    writeFileSync(join(root, "brand", "acme", "brand.json"), JSON.stringify(brand));
  }
  return root;
}

const check = (root) => spawnSync("bash", [SCRIPT, root], { encoding: "utf8" });

test("a profile on a real project with a deploy section is ready", () => {
  const r = check(repo({ brand: { firebase: { projectId: "acme" }, deploy: DEPLOY } }));
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "project=acme\nready=true\n");
});

test("a local-only profile skips, naming the way to go live", () => {
  const r = check(repo({ brand: { firebase: { projectId: "demo-acme" } } }));
  assert.equal(r.status, 0);
  assert.match(
    r.stdout,
    /^project=demo-acme\nready=false\nreason=profile "acme" is local-only \(project demo-acme\)/,
  );
  assert.match(r.stdout, /pnpm brand:init --connect/);
});

test("a real project without a deploy section skips, pointing at brand:provision", () => {
  for (const deploy of [undefined, { serviceAccount: DEPLOY.serviceAccount }]) {
    const r = check(repo({ brand: { firebase: { projectId: "acme" }, deploy } }));
    assert.equal(r.status, 0);
    assert.match(
      r.stdout,
      /^project=acme\nready=false\nreason=.*no "deploy" section.*pnpm brand:provision/,
    );
  }
});

test("a broken selection fails loudly instead of skipping", () => {
  for (const root of [
    repo({ config: null }),
    repo({ config: { profile: "../etc" } }),
    repo({ config: { profile: "other" } }),
  ]) {
    const r = check(root);
    assert.equal(r.status, 1, r.stdout);
    assert.equal(r.stdout, "");
  }
});

test("judges a past commit with a git ref", () => {
  const root = repo({ brand: { firebase: { projectId: "demo-acme" } } });
  const git = (...args) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  git("init", "-q");
  git("add", "-A");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "local");
  writeFileSync(
    join(root, "brand", "acme", "brand.json"),
    JSON.stringify({ firebase: { projectId: "acme" }, deploy: DEPLOY }),
  );
  assert.equal(check(root).stdout, "project=acme\nready=true\n");
  const past = spawnSync("bash", [SCRIPT, root, "HEAD"], { encoding: "utf8" });
  assert.match(past.stdout, /^project=demo-acme\nready=false\n/);
});

test("the committed profile is ready to deploy", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  assert.match(check(root).stdout, /^project=jci-oriente\nready=true\n$/);
});
