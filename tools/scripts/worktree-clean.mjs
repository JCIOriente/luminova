// pnpm wt:clean [--apply] [--branches]
// Removes .worktrees/<slug> worktrees and local branches whose work has landed. Previews by
// default; only --apply deletes. The rules live in lib/worktree-clean.mjs.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { mergedHeadsByBranch, parseBranches, parseWorktrees, plan } from "./lib/worktree-clean.mjs";

const MERGED_PR_LIMIT = 1000;
const args = new Set(process.argv.slice(2));
for (const arg of args) {
  if (!["--apply", "--branches"].includes(arg)) {
    console.error(`Unknown option ${arg}. Usage: pnpm wt:clean [--apply] [--branches]`);
    process.exit(2);
  }
}
const apply = args.has("--apply");

const run = (cmd, argv, cwd) =>
  execFileSync(cmd, argv, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const currentPath = run("git", ["rev-parse", "--show-toplevel"]).trim();
const primary = dirname(resolve(currentPath, run("git", ["rev-parse", "--git-common-dir"]).trim()));
const git = (...argv) => run("git", ["-C", primary, ...argv]);

git("fetch", "--prune", "--quiet", "origin");

function loadMergedHeads() {
  try {
    const prs = JSON.parse(
      run(
        "gh",
        [
          "pr",
          "list",
          "--state",
          "merged",
          "--limit",
          String(MERGED_PR_LIMIT),
          "--json",
          "headRefName,headRefOid",
        ],
        primary,
      ),
    );
    if (prs.length >= MERGED_PR_LIMIT)
      console.warn(
        `Warning: hit the ${MERGED_PR_LIMIT} merged-PR limit; older merges count only if in origin/main.`,
      );
    return mergedHeadsByBranch(prs);
  } catch (error) {
    console.warn(
      `Warning: gh pr list failed, so squash-merged branches will be kept.\n  ${error.stderr ?? error.message}`.trim(),
    );
    return new Map();
  }
}

const worktrees = parseWorktrees(git("worktree", "list", "--porcelain"));
const branches = parseBranches(
  git(
    "for-each-ref",
    "--format=%(refname:short)%00%(objectname)%00%(upstream:track)",
    "refs/heads",
  ),
);
const mergedHeads = loadMergedHeads();

const inMain = new Set();
const patchesInMain = new Set();
for (const [name, { tip }] of branches) {
  try {
    git("merge-base", "--is-ancestor", tip, "origin/main");
    inMain.add(name);
  } catch (error) {
    // Exit status 1 means "not an ancestor"; anything else is a real failure.
    if (error.status !== 1) throw error;
    // `git cherry` prefixes "+" to a commit whose patch origin/main does not have.
    if (!/^\+/m.test(git("cherry", "origin/main", tip))) patchesInMain.add(name);
  }
}

const dirty = new Set();
for (const wt of worktrees.slice(1)) {
  if (!existsSync(wt.path)) continue;
  if (run("git", ["-C", wt.path, "status", "--porcelain"]).trim()) dirty.add(wt.path);
}

const rows = plan({
  worktrees,
  branches,
  mergedHeads,
  inMain,
  patchesInMain,
  dirty,
  worktreesDir: join(primary, ".worktrees"),
  currentPath,
  includeBranches: args.has("--branches"),
});

const label = (row) =>
  row.kind === "worktree" ? row.path.slice(primary.length + 1) : "(branch only)";
const width = Math.max(0, ...rows.map((r) => label(r).length));
const branchWidth = Math.max(0, ...rows.map((r) => (r.branch ?? "-").length));
for (const row of rows) {
  const verdict = row.remove ? (apply ? "remove" : "would remove") : "keep";
  console.log(
    `${verdict.padEnd(12)} ${label(row).padEnd(width)}  ${(row.branch ?? "-").padEnd(branchWidth)}  ${row.reason}`,
  );
}

const doomed = rows.filter((r) => r.remove);
console.log(
  `\n${doomed.length} to remove, ${rows.length - doomed.length} kept.` +
    (apply
      ? ""
      : " Preview only: rerun with --apply to delete." +
        (args.has("--branches") ? "" : " Add --branches for branches without a worktree.")),
);
if (!apply) process.exit(0);

git("worktree", "prune");
let failures = 0;
for (const row of doomed) {
  try {
    if (row.kind === "worktree" && existsSync(row.path)) git("worktree", "remove", row.path);
    // -D: a squash-merged branch is never an ancestor of main. landedReason already proved it landed.
    git("branch", "-D", row.branch);
  } catch (error) {
    failures++;
    console.error(`Failed on ${row.branch}: ${(error.stderr ?? error.message).trim()}`);
  }
}
git("worktree", "prune");
console.log(failures ? `${failures} removal(s) failed.` : "Done.");
process.exit(failures ? 1 : 0);
