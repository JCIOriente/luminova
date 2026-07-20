// Enforcement tests for review-gate.sh — the hook that actually blocks `gh pr create`.
// The router's fixture tests prove WHAT a diff owes; these prove the gate acts on it.
// Each case builds a throwaway git repo and feeds the hook a real PreToolUse payload.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HOOKS = dirname(fileURLToPath(import.meta.url));
const GATE = join(HOOKS, "review-gate.sh");

let repo;
const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
const write = (f, s) => writeFileSync(join(repo, f), s);
const commit = (msg, ...extra) => git("commit", "-q", "-m", msg, ...extra);

/** Run the gate exactly as the harness would, and return its exit code. */
function gate() {
  const payload = JSON.stringify({ cwd: repo, tool_input: { command: "gh pr create --fill" } });
  try {
    execFileSync("bash", [GATE], { input: payload, stdio: ["pipe", "pipe", "pipe"] });
    return 0;
  } catch (e) {
    return e.status;
  }
}

const BLOCKED = 2;
const ALLOWED = 0;

before(() => {
  repo = mkdtempSync(join(tmpdir(), "review-gate-"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  write("README.md", "base\n");
  git("add", "-A");
  commit("base");
});

after(() => rmSync(repo, { recursive: true, force: true }));

test("sensitive diff with no stamp is blocked", () => {
  git("checkout", "-qb", "feat/rules");
  write("firestore.rules", "allow read;\n");
  git("add", "-A");
  commit("feat: rules");
  assert.equal(gate(), BLOCKED);
});

test("a fresh Reviews stamp lets the PR through", () => {
  commit(
    "chore: reviews",
    "--allow-empty",
    "-m",
    `Reviews: ${git("rev-parse", "HEAD")} security-review`,
  );
  assert.equal(gate(), ALLOWED);
});

test("a sensitive change after the stamp makes it stale again", () => {
  appendFileSync(join(repo, "firestore.rules"), "allow write;\n");
  git("add", "-A");
  commit("feat: more rules");
  assert.equal(gate(), BLOCKED);
});

test("the legacy Security-Reviewed trailer is still honored", () => {
  commit("chore: legacy", "--allow-empty", "-m", `Security-Reviewed: ${git("rev-parse", "HEAD")}`);
  assert.equal(gate(), ALLOWED);
});

test("a NON-sensitive change after the stamp keeps it fresh", () => {
  appendFileSync(join(repo, "README.md"), "more\n");
  git("add", "-A");
  commit("docs: readme");
  assert.equal(gate(), ALLOWED);
});

test("a symbolic ref in the trailer must not self-certify", () => {
  git("checkout", "-qb", "feat/forge");
  appendFileSync(join(repo, "firestore.rules"), "allow delete;\n");
  git("add", "-A");
  commit("feat: rules3");
  commit("chore: forged", "--allow-empty", "-m", "Reviews: HEAD security-review");
  assert.equal(gate(), BLOCKED);
});

test("a branch touching nothing sensitive needs no stamp", () => {
  git("checkout", "-q", "main");
  git("checkout", "-qb", "chore/docs-only");
  appendFileSync(join(repo, "README.md"), "docs\n");
  git("add", "-A");
  commit("docs: only");
  assert.equal(gate(), ALLOWED);
});

test("a non-PR-create command is ignored entirely", () => {
  git("checkout", "-q", "feat/forge");
  const payload = JSON.stringify({
    cwd: repo,
    // Mentions the command but does not run it — the gate must not fire.
    tool_input: { command: 'echo "gh pr create"' },
  });
  const out = execFileSync("bash", [GATE], { input: payload, encoding: "utf8" });
  assert.equal(out, "");
});
