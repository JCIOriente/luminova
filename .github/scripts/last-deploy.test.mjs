/** Fixture tests for last-deploy.sh, which finds the commit Deploy last shipped to a project.
 *
 *  Run: node --test .github/scripts/last-deploy.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "last-deploy.sh");
const WORKFLOW = readFileSync(join(HERE, "..", "workflows", "deploy.yml"), "utf8");

/** `gh run list --json displayTitle` output, newest first. */
const runs = (...titles) => JSON.stringify(titles.map((displayTitle) => ({ displayTitle })));

/** A full commit sha made of one hex digit. */
const sha = (digit) => digit.repeat(40);

/** The title deploy.yml gives a run that could deploy every changed surface. */
const deployed = (project, commit) => `Deploy to ${project} at ${commit}`;

const lastDeploy = (project, json) =>
  spawnSync("bash", [SCRIPT, project], { encoding: "utf8", input: json });

test("the commit named by the newest run that deployed every changed surface to this project", () => {
  const r = lastDeploy(
    "acme-prod",
    runs(
      deployed("acme-prod", sha("3")),
      deployed("acme-prod", sha("2")),
      deployed("acme-prod", sha("1")),
    ),
  );
  assert.equal(r.status, 0);
  assert.equal(r.stdout, `${sha("3")}\n`);
});

test("reads the commit from the title, never the run's own head (a workflow_run's is CI's)", () => {
  const json = JSON.stringify([
    { displayTitle: deployed("acme-prod", sha("7")), headSha: sha("9") },
  ]);
  assert.equal(lastDeploy("acme-prod", json).stdout, `${sha("7")}\n`);
});

test("ignores a partial dispatch: other surfaces' changes are still undeployed", () => {
  const json = runs(
    "Deploy acme-prod: hosting only",
    "Deploy acme-prod: functions only",
    deployed("acme-prod", sha("1")),
  );
  assert.equal(lastDeploy("acme-prod", json).stdout, `${sha("1")}\n`);
});

test("ignores a run that skipped (CI red, or not a push to main) or was not set up", () => {
  const json = runs("Deploy (skipped)", "Deploy (not set up)", deployed("acme-prod", sha("2")));
  assert.equal(lastDeploy("acme-prod", json).stdout, `${sha("2")}\n`);
});

test("ignores another project's runs, and a project whose name only starts like this one", () => {
  const json = runs(
    deployed("demo-acme", sha("5")),
    deployed("acme-staging", sha("4")),
    deployed("acme-prod-2", sha("3")),
    deployed("acme-prod", sha("2")),
  );
  assert.equal(lastDeploy("acme-prod", json).stdout, `${sha("2")}\n`);
});

test("ignores malformed titles and keeps looking", () => {
  const json = runs(
    "Deploy to acme-prod",
    `Deploy to acme-prod at ${sha("a").slice(1)}`,
    `Deploy to acme-prod at ${sha("A")}`,
    `Deploy to acme-prod at ${sha("b")} `,
    `Deploy to acme-prod at ${sha("c")}\nspotlight=false`,
    `Deploy to acme-prod at ${sha("d")}0`,
    ` Deploy to acme-prod at ${sha("e")}`,
    deployed("acme-prod", sha("1")),
  );
  assert.equal(lastDeploy("acme-prod", json).stdout, `${sha("1")}\n`);
});

test("prints nothing for a first deploy: no run, only partial or skipped runs, or another project", () => {
  for (const json of [
    "[]",
    runs("Deploy", "Deploy (not set up)", "Deploy (skipped)", "Deploy acme-prod: rules only"),
    runs(deployed("acme-staging", sha("1"))),
  ]) {
    const r = lastDeploy("acme-prod", json);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, "");
  }
});

test("prints nothing on unreadable input, so Deploy ships every surface", () => {
  for (const json of ["", "not json", '{"message":"Bad credentials"}', "[1, null, {}]"]) {
    const r = lastDeploy("acme-prod", json);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, "");
  }
});

/** deploy.yml's run-name expression, folded onto one line. */
function runName() {
  const block = WORKFLOW.match(/^run-name: >-\n((?: {2}.*\n)+)/m)?.[1];
  assert.ok(block, "deploy.yml has a folded run-name");
  return block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");
}

test("deploy.yml titles a deploy only for runs that can deploy every changed surface", () => {
  const name = runName();
  // The two branches that earn the title, each mirroring the filter job's `if`.
  assert.match(
    name,
    /github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main' && inputs\.surface == 'all'\) && format\('Deploy to \{0\} at \{1\}', vars\.FIREBASE_PROJECT_ID, github\.sha\)/,
  );
  assert.match(
    name,
    /github\.event_name == 'workflow_run' && github\.event\.workflow_run\.conclusion == 'success' && github\.event\.workflow_run\.head_branch == 'main' && github\.event\.workflow_run\.event == 'push'\) && format\('Deploy to \{0\} at \{1\}', vars\.FIREBASE_PROJECT_ID, github\.event\.workflow_run\.head_sha\)/,
  );
  assert.equal((name.match(/'Deploy to \{0\} at \{1\}'/g) ?? []).length, 2);
  // Every other title cannot match "Deploy to <project> at <sha>".
  for (const other of ["'Deploy (not set up)'", "'Deploy {0}: {1} only'", "'Deploy (skipped)'"]) {
    assert.ok(name.includes(other), `run-name has ${other}`);
  }
  assert.match(readFileSync(SCRIPT, "utf8"), /"Deploy to \$project at "/);
});

test("the filter job deploys a dispatch only from main, as the title assumes", () => {
  const filter = WORKFLOW.slice(WORKFLOW.indexOf("  filter:"), WORKFLOW.indexOf("    outputs:"));
  assert.match(
    filter,
    /\(github\.event_name == 'workflow_dispatch' &&\s+github\.ref == 'refs\/heads\/main'\) \|\|/,
  );
});
