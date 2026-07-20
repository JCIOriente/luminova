// Enforcement tests for review-gate.sh — the hook that actually blocks `gh pr create`.
// The router's fixture tests prove WHAT a diff owes; these prove the gate acts on it.
// Each case builds a throwaway git repo and feeds the hook a real PreToolUse payload.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, cpSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HOOKS = dirname(fileURLToPath(import.meta.url));
const GATE = join(HOOKS, "review-gate.sh");

let repo;
const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
const write = (f, s) => {
  mkdirSync(dirname(join(repo, f)), { recursive: true });
  writeFileSync(join(repo, f), s);
};
const commit = (msg, ...extra) => git("commit", "-q", "-m", msg, ...extra);

/** Run the gate exactly as the harness would, and return its exit code. */
function gate(command = "gh pr create --fill") {
  const payload = JSON.stringify({ cwd: repo, tool_input: { command } });
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

test("a non-ASCII sensitive filename is still blocked (no quotePath bypass)", () => {
  git("checkout", "-q", "main");
  git("checkout", "-qb", "feat/acentos");
  // Identical content to the blocked case; only the NAME carries an accent.
  write("apps/beacon/src/índex.ts", "export const f = 1;\n");
  git("add", "-A");
  commit("feat: función");
  assert.equal(gate(), BLOCKED);
});

test("extra whitespace in the command does not skip the gate", () => {
  // The cheap prefilter used to be stricter than the authoritative regex, so
  // these forms slipped past a gate that should have blocked them.
  assert.equal(gate("gh  pr create --fill"), BLOCKED);
  assert.equal(gate("gh\tpr\tcreate --fill"), BLOCKED);
  assert.equal(gate("cd /tmp && gh pr create --fill"), BLOCKED);
});

test("a broken rubric BLOCKS — a control that cannot classify must not pass", () => {
  // The rubric is itself hard-gated, so a fail-open here would let a PR that
  // breaks the rubric switch off its own gate. Run a COPY of the hooks dir with
  // a corrupted rubric so the real one is untouched.
  const sandbox = mkdtempSync(join(tmpdir(), "review-gate-broken-"));
  cpSync(HOOKS, join(sandbox, "hooks"), { recursive: true });
  writeFileSync(join(sandbox, "review-routing.json"), "{ this is not json");
  git("checkout", "-q", "feat/rules"); // branch with an unstamped firestore.rules change

  const payload = JSON.stringify({ cwd: repo, tool_input: { command: "gh pr create --fill" } });
  let status = 0;
  try {
    execFileSync("bash", [join(sandbox, "hooks", "review-gate.sh")], {
      input: payload,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (e) {
    status = e.status;
  }
  rmSync(sandbox, { recursive: true, force: true });
  assert.equal(status, BLOCKED);
});

test("a hex-NAMED ref must not self-certify like a sha", () => {
  // Fresh branch: an earlier branch's legitimate stamps would make this pass for
  // the wrong reason. The ONLY stamp here names a tag that merely LOOKS like a sha.
  git("checkout", "-q", "main");
  git("checkout", "-qb", "feat/forged-tag");
  write("firestore.rules", "allow read;\n");
  git("add", "-A");
  commit("feat: rules");
  git("tag", "deadbeef", "HEAD");
  commit("chore: forged tag stamp", "--allow-empty", "-m", "Reviews: deadbeef security-review");
  const result = gate();
  git("tag", "-d", "deadbeef");
  assert.equal(result, BLOCKED);
});

test("a space-separated token list is accepted, not silently blocked", () => {
  git("checkout", "-q", "main");
  git("checkout", "-qb", "feat/spaces");
  write("firestore.rules", "allow read;\n");
  git("add", "-A");
  commit("feat: rules");
  commit(
    "chore: reviews",
    "--allow-empty",
    "-m",
    `Reviews: ${git("rev-parse", "HEAD")} security-review firestore-security-reviewer`,
  );
  assert.equal(gate(), ALLOWED);
});

test("`gh pr create --head <other-branch>` is refused, not silently allowed", () => {
  // The bypass: --head opens a PR for any pushed branch, but the gate can only
  // evaluate the tree it stands in. From main (where the primary checkout of a
  // worktree-first repo habitually sits) the evaluated diff is empty.
  git("checkout", "-q", "main");
  assert.equal(gate("gh pr create --head feat/rules --title x --body y"), BLOCKED);
  assert.equal(gate("gh pr create -H feat/rules --fill"), BLOCKED);
  assert.equal(gate("gh pr create --head=feat/rules --fill"), BLOCKED);
});

test("--head naming the branch you are actually on is allowed through the check", () => {
  // Reaches the normal evaluation: docs-only branch, so nothing is owed.
  git("checkout", "-q", "chore/docs-only");
  assert.equal(gate("gh pr create --head chore/docs-only --fill"), ALLOWED);
  // `owner:branch` form resolves to the same branch.
  assert.equal(gate("gh pr create --head JCIOriente:chore/docs-only --fill"), ALLOWED);
});

test("a command that merely MENTIONS gh pr create in a quoted string is ignored", () => {
  // Fresh UNSTAMPED sensitive branch: reusing an earlier branch would already
  // carry a stamp, so the "still blocks" assertion would pass for the wrong reason.
  git("checkout", "-q", "main");
  git("checkout", "-qb", "feat/quoted-mention");
  write("firestore.rules", "allow read;\n");
  git("add", "-A");
  commit("feat: rules");
  // These used to block ordinary checkpoint commits with a PR-gate message, and
  // made the advisory hook announce a PR that was never opened.
  assert.equal(gate("git commit -m 'docs: how to use gh pr create here'"), ALLOWED);
  assert.equal(gate('git commit -m "chore: explain gh pr create"'), ALLOWED);
  // The real command is never itself quoted, so it still blocks.
  assert.equal(gate('gh pr create --title "gh pr create" --body y'), BLOCKED);
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
