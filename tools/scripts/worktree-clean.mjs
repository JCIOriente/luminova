// pnpm wt:clean [--apply] [--branches]
// Removes .worktrees/<slug> worktrees and local branches whose work has landed in origin/main.
// Previews by default (it only refreshes remote refs); --apply deletes. Rules: lib/worktree-clean.mjs.
import { execFile, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import {
  mergedHeadsByBranch,
  parseBranches,
  parseStatus,
  parseWorktrees,
  plan,
} from "./lib/worktree-clean.mjs";

const MERGED_PR_LIMIT = 1000;
// ls-files and log output can pass the 1 MiB default, which would throw ENOBUFS.
const MAX_BUFFER = 1024 ** 3;
const USAGE = "Usage: pnpm wt:clean [--apply] [--branches]";
const args = new Set(process.argv.slice(2));
for (const arg of args) {
  if (!["--apply", "--branches"].includes(arg)) {
    console.error(`Unknown option ${arg}. ${USAGE}`);
    process.exit(2);
  }
}
const apply = args.has("--apply");
const includeBranches = args.has("--branches");

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
const git = (...argv) => run("git", ["-C", primary, ...argv]);

async function loadMergedHeads() {
  try {
    const { stdout } = await promisify(execFile)(
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
      ].concat(["--json", "headRefName,headRefOid"]),
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
      `Warning: gh pr list failed; branches are judged by content only.\n  ${(error.stderr || error.message).trim()}`,
    );
    return new Map();
  }
}

const [mergedHeads] = await Promise.all([
  loadMergedHeads(),
  promisify(execFile)("git", ["-C", primary, "fetch", "--prune", "--quiet", "origin"]),
]);

const worktrees = parseWorktrees(git("worktree", "list", "--porcelain", "-z"));
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
function inMain(name) {
  const { tip } = branches.get(name);
  const base = git("merge-base", MAIN, tip).trim();
  const touched = [
    ...new Set(
      git("log", "--format=", "--name-only", "--no-renames", "-m", `${base}..${tip}`)
        .split("\n")
        .filter(Boolean),
    ),
  ];
  if (!touched.length) return true;
  try {
    git("--literal-pathspecs", "diff", "--quiet", "--no-ext-diff", MAIN, tip, "--", ...touched);
    return true;
  } catch (error) {
    // Exit status 1 means the paths differ: main lacks some of the branch's content.
    if (error.status === 1) return false;
    throw error;
  }
}

function inspect(path) {
  if (!existsSync(path)) return { exists: false, dirty: false, ignored: [] };
  const status = run("git", [
    "-C",
    path,
    "status",
    "--porcelain",
    "-z",
    "--untracked-files=normal",
    "--ignored=matching",
    "--ignore-submodules=none",
  ]);
  // `ls-files -v` tags assume-unchanged (lowercase) and skip-worktree (S) files, whose local
  // edits neither `status` nor `worktree remove` would notice.
  const hidden = run("git", ["-C", path, "ls-files", "-v"])
    .split("\n")
    .some((line) => /^[a-zS] /.test(line));
  const state = parseStatus(status);
  return { exists: true, ...state, dirty: state.dirty || hidden };
}

const rows = plan({
  worktrees,
  branches,
  mergedHeads,
  inMain,
  inspect,
  worktreesDir: join(primary, ".worktrees"),
  currentPath,
  includeBranches,
});

const cells = rows.map((row) => [
  row.remove ? (apply ? "remove" : "would remove") : "keep",
  row.kind === "worktree" ? row.path.slice(primary.length + 1) : "(branch only)",
  row.branch ?? "-",
  row.reason,
]);
const widths = [0, 1, 2].map((i) => Math.max(0, ...cells.map((c) => c[i].length)));
for (const c of cells) console.log(c.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join("  "));

const doomed = rows.filter((r) => r.remove);
console.log(`\n${doomed.length} to remove, ${rows.length - doomed.length} kept.`);
if (!apply) {
  console.log("Preview only: rerun with --apply to delete.");
  if (!includeBranches) console.log("Add --branches for branches without a worktree.");
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
      if (now.exists && (now.dirty || now.ignored.length))
        throw new Error("worktree changed since it was judged; rerun");
      if (
        now.exists &&
        run("git", ["-C", row.path, "symbolic-ref", "-q", "HEAD"]).trim() !==
          `refs/heads/${row.branch}`
      )
        throw new Error("worktree switched branch since it was judged; rerun");
      // Never a blanket `worktree prune`: it would drop kept worktrees' HEADs too. `remove`
      // also clears the metadata of a worktree whose directory is already gone.
      git("-c", "status.showUntrackedFiles=all", "worktree", "remove", row.path);
    }
    // -D: a squash- or rebase-merged branch is not an ancestor of main; the verdict proved it landed.
    git("branch", "-D", row.branch);
  } catch (error) {
    failures++;
    console.error(`Failed on ${row.branch}: ${(error.stderr || error.message).trim()}`);
  }
}
console.log(failures ? `${failures} removal(s) failed.` : "Done.");
process.exit(failures ? 1 : 0);
