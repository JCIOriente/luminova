// pnpm wt:clean [--dry-run]
// Removes .worktrees/<slug> worktrees and local branches whose work has landed in origin/main,
// and keeps the rest with the reason. --dry-run only prints (it still refreshes remote refs).
// Rules: lib/worktree-clean.mjs.
import { execFile, execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { promisify } from "node:util";
import {
  MISSING_WORKTREE,
  mergedHeadsByBranch,
  parseBranches,
  parseWorktreeState,
  parseWorktrees,
  plan,
  touchedPathDiffers,
  worktreeBlocker,
} from "./lib/worktree-clean.mjs";
import { BRAND_LOCAL, isRebuildableBrandSeed } from "./lib/brand-seed.mjs";

const MERGED_PR_LIMIT = 1000;
// ls-files and log output can pass the 1 MiB default, which would throw ENOBUFS.
const MAX_BUFFER = 1024 ** 3;
const USAGE = "Usage: pnpm wt:clean [--dry-run]";
const args = new Set(process.argv.slice(2));
for (const arg of args) {
  if (arg !== "--dry-run") {
    console.error(`Unknown option ${arg}. ${USAGE}`);
    process.exit(2);
  }
}
const dryRun = args.has("--dry-run");

const run = (cmd, argv, cwd) =>
  execFileSync(cmd, argv, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: MAX_BUFFER,
  });

const currentPath = run("git", ["rev-parse", "--show-toplevel"]).trim();
const primary = dirname(
  run("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim(),
);
const gitIn = (dir, ...argv) => run("git", ["-C", dir, ...argv]);
const git = (...argv) => gitIn(primary, ...argv);
const execFileAsync = promisify(execFile);
const errorText = (error) => (error.stderr || error.message).trim();

async function loadMergedHeads() {
  try {
    const { stdout } = await execFileAsync(
      "gh",
      [
        "pr",
        "list",
        "--state",
        "merged",
        "--base",
        "main",
        "--limit",
        String(MERGED_PR_LIMIT),
        "--json",
        "headRefName,headRefOid",
      ],
      { cwd: primary },
    );
    const prs = JSON.parse(stdout);
    if (prs.length >= MERGED_PR_LIMIT)
      console.warn(
        `Warning: hit the ${MERGED_PR_LIMIT} merged-PR limit; older merges are judged by content only.`,
      );
    return mergedHeadsByBranch(prs);
  } catch (error) {
    console.warn(
      `Warning: gh pr list failed; branches are judged by content only.\n  ${errorText(error)}`,
    );
    return new Map();
  }
}

const [mergedHeads] = await Promise.all([
  loadMergedHeads(),
  execFileAsync("git", ["-C", primary, "fetch", "--prune", "--quiet", "origin"]),
]);

// The branch a rebase or bisect in progress is working on; git records it in these files.
function busyBranches(path) {
  if (!existsSync(path)) return [];
  return ["rebase-merge/head-name", "rebase-apply/head-name", "BISECT_START"].flatMap((file) => {
    const statePath = gitIn(path, "rev-parse", "--path-format=absolute", "--git-path", file).trim();
    if (!existsSync(statePath)) return [];
    return [
      readFileSync(statePath, "utf8")
        .trim()
        .replace(/^refs\/heads\//, ""),
    ];
  });
}

const worktrees = parseWorktrees(git("worktree", "list", "--porcelain", "-z")).map((wt) => ({
  ...wt,
  busyBranches: busyBranches(wt.path),
}));
const branches = parseBranches(
  git(
    "for-each-ref",
    "--format=%(refname:lstrip=2)%00%(objectname)%00%(upstream:track)",
    "refs/heads",
  ),
);
// The full ref: a local branch named "origin/main" would shadow the remote one.
const MAIN = "refs/remotes/origin/main";

// Landed by content: every path any branch commit touched (merges included, both sides of a
// rename) is identical at the tip and on main now. Then main holds the branch's final state of
// everything it changed, however it was merged. Comparing commit patches instead is fooled by a
// follow-up commit that undoes part of a squash, or by a change main later reverted.
// -z: without it git quotes unusual names ("caf\303\251.txt"), which then match nothing.
// Explicit merge and submodule flags so user config cannot hide paths.
const PATH_FLAGS = ["-z", "--name-only", "--no-renames", "--ignore-submodules=none"];
const paths = (output) => output.split("\0").filter(Boolean);

function inMain(name) {
  const { tip } = branches.get(name);
  try {
    const base = git("merge-base", MAIN, tip).trim();
    const log = git("log", ...PATH_FLAGS, "--format=", "--diff-merges=separate", `${base}..${tip}`);
    const differing = git("diff", ...PATH_FLAGS, "--no-ext-diff", MAIN, tip);
    return !touchedPathDiffers(new Set(paths(log)), paths(differing));
  } catch (error) {
    // One unjudgeable branch (unrelated history, say) must not stop the rest; keep it.
    console.warn(`Warning: could not judge ${name}, keeping it: ${errorText(error)}`);
    return false;
  }
}

function inspect(path) {
  if (!existsSync(path)) return MISSING_WORKTREE;
  return parseWorktreeState({
    status: gitIn(
      path,
      "status",
      "--porcelain",
      "-z",
      "--untracked-files=normal",
      "--ignored=matching",
      "--ignore-submodules=none",
    ),
    lsFiles: gitIn(path, "ls-files", "-v"),
    refs: gitIn(path, "for-each-ref", "--format=%(refname)", "refs/worktree", "refs/bisect"),
    // Install seeds brand/local/ in every worktree; only the member's own brand keeps one.
    rebuildable: isRebuildableBrandSeed(path) ? [BRAND_LOCAL] : [],
  });
}

const rows = plan({
  worktrees,
  branches,
  mergedHeads,
  inMain,
  inspect,
  worktreesDir: join(primary, ".worktrees"),
  currentPath,
});

const cells = rows.map((row) => [
  row.remove ? (dryRun ? "would remove" : "remove") : "keep",
  row.kind === "worktree" ? relative(primary, row.path) : "(branch only)",
  row.branch ?? "-",
  row.reason,
]);
const widths = [0, 1, 2].map((i) => Math.max(0, ...cells.map((c) => c[i].length)));
for (const c of cells)
  console.log(
    c
      .map((cell, i) => cell.padEnd(widths[i] ?? 0))
      .join("  ")
      .trimEnd(),
  );

const doomed = rows.filter((r) => r.remove);
console.log(`\n${doomed.length} to remove, ${rows.length - doomed.length} kept.`);
if (dryRun) {
  console.log("Dry run: nothing deleted. Run without --dry-run to remove them.");
  process.exit(0);
}

let failures = 0;
for (const row of doomed) {
  try {
    // A concurrent session may have committed since the verdict; never drop a moved branch.
    if (git("rev-parse", `refs/heads/${row.branch}`).trim() !== branches.get(row.branch).tip)
      throw new Error("branch moved since it was judged; rerun");
    if (row.kind === "worktree") {
      // Re-check right before deleting: files or a switched HEAD may have appeared since.
      const now = inspect(row.path);
      if (now.exists) {
        const blocker = worktreeBlocker(now);
        if (blocker) throw new Error(`${blocker} appeared since it was judged; rerun`);
        if (gitIn(row.path, "symbolic-ref", "-q", "HEAD").trim() !== `refs/heads/${row.branch}`)
          throw new Error("worktree switched branch since it was judged; rerun");
      }
      // Never a blanket `worktree prune`: it would drop kept worktrees' HEADs too. `remove`
      // also clears the metadata of a worktree whose directory is already gone.
      git("-c", "status.showUntrackedFiles=all", "worktree", "remove", row.path);
    }
    // -D: a squash- or rebase-merged branch is not an ancestor of main; the verdict proved it landed.
    git("branch", "-D", row.branch);
  } catch (error) {
    failures++;
    console.error(`Failed on ${row.branch}: ${errorText(error)}`);
  }
}
console.log(failures ? `${failures} removal(s) failed.` : "Done.");
process.exit(failures ? 1 : 0);
