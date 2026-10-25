// Which worktrees and local branches `pnpm wt:clean` may delete. Pure: the CLI gathers git and
// gh state, this decides. A branch is deletable only when nothing on it would be lost.

const PROTECTED_BRANCHES = new Set(["main", "master"]);
// Gitignored output a fresh install or build recreates. Any other ignored file (.env.local,
// local notes) keeps its worktree, since `git worktree remove` deletes ignored files too.
const ARTIFACT_SEGMENTS = new Set(["node_modules", ".turbo", "dist", "dev-dist", "coverage"]);
const ARTIFACT_FILES = [/-debug\.log$/, /\.tsbuildinfo$/, /^\.firebaserc$/];

/** `git worktree list --porcelain -z` → [{ path, branch, prunable, locked }]; branch is null
 *  when detached. The first entry is the primary checkout. */
export function parseWorktrees(output) {
  return output
    .split("\0\0")
    .filter(Boolean)
    .map((block) => {
      const entry = { path: "", branch: null, prunable: false, locked: false };
      for (const line of block.split("\0")) {
        const [key, ...rest] = line.split(" ");
        if (key === "worktree") entry.path = rest.join(" ");
        else if (key === "branch") entry.branch = rest.join(" ").replace(/^refs\/heads\//, "");
        else if (key === "prunable") entry.prunable = true;
        else if (key === "locked") entry.locked = true;
      }
      return entry;
    });
}

/** `git for-each-ref --format='%(refname:lstrip=2)%00%(objectname)%00%(upstream:track)' refs/heads`
 *  → Map<branch, { tip, upstreamGone }>. */
export function parseBranches(output) {
  const branches = new Map();
  for (const line of output.split("\n")) {
    if (!line) continue;
    const [name, tip, track = ""] = line.split("\0");
    branches.set(name, { tip, upstreamGone: track.includes("gone") });
  }
  return branches;
}

/** `gh pr list --state merged --base main --json headRefName,headRefOid` → Map<branch, Set<oid>>.
 *  A name can be reused, so one branch may have several merged heads. */
export function mergedHeadsByBranch(prs) {
  const heads = new Map();
  for (const { headRefName, headRefOid } of prs) {
    if (!heads.has(headRefName)) heads.set(headRefName, new Set());
    heads.get(headRefName).add(headRefOid);
  }
  return heads;
}

const isArtifact = (path) => {
  const trimmed = path.replace(/\/$/, "");
  return (
    trimmed.split("/").some((segment) => ARTIFACT_SEGMENTS.has(segment)) ||
    ARTIFACT_FILES.some((pattern) => pattern.test(trimmed))
  );
};

const nonEmpty = (output, separator) => output.split(separator).filter(Boolean);

/** A worktree's local state from `git status --porcelain -z --ignored=matching`,
 *  `git ls-files -v` and `git for-each-ref --format=%(refname) refs/worktree refs/bisect`.
 *  `ignored` lists only files a rebuild would not bring back. `ls-files -v` tags
 *  assume-unchanged (lowercase) and skip-worktree (S) files: their edits are invisible to
 *  `status` and to `worktree remove`, so they count as dirty. */
export function parseWorktreeState({ status, lsFiles = "", refs = "" }) {
  const entries = nonEmpty(status, "\0");
  const isIgnored = (entry) => entry.startsWith("!! ");
  return {
    exists: true,
    dirty:
      entries.some((entry) => !isIgnored(entry)) ||
      nonEmpty(lsFiles, "\n").some((line) => /^[a-zS] /.test(line)),
    ignored: entries
      .filter(isIgnored)
      .map((entry) => entry.slice(3))
      .filter((path) => !isArtifact(path)),
    localRefs: nonEmpty(refs, "\n"),
  };
}

export const MISSING_WORKTREE = { exists: false, dirty: false, ignored: [], localRefs: [] };

/** Why a worktree's local state forbids removing it, or null. `worktree remove` would delete
 *  ignored files and worktree-local refs along with the directory. */
export function worktreeBlocker(state) {
  if (state.dirty) return "uncommitted changes";
  if (state.ignored.length) return `ignored files: ${state.ignored.join(", ")}`;
  if (state.localRefs.length) return `worktree-local refs: ${state.localRefs.join(", ")}`;
  return null;
}

/** Whether a path that differs between main and the tip is one the branch touched, or lies
 *  under one (a touched file that became a directory). */
export function touchedPathDiffers(touched, differing) {
  return differing.some((path) => {
    const parts = path.split("/");
    return parts.some((_, i) => touched.has(parts.slice(0, i + 1).join("/")));
  });
}

/** Whether a branch's commits are safe to drop. `inMain()` is true when origin/main already
 *  holds the branch's final state of every path the branch touched. A branch freshly cut from
 *  main passes that too, so content alone counts only once the remote branch was deleted. */
export function branchVerdict({ tip, upstreamGone, inMain }, heads) {
  if (heads?.has(tip)) return { remove: true, reason: "merged PR head" };
  if (upstreamGone && inMain()) return { remove: true, reason: "in origin/main" };
  if (upstreamGone) return { remove: false, reason: "remote deleted, has changes main lacks" };
  if (heads) return { remove: false, reason: "not at a merged PR head" };
  return { remove: false, reason: "no merged PR" };
}

/** Decide every linked worktree, then every branch no worktree has checked out (a branch
 *  whose worktree is kept is never deleted on its own). `inMain(branch)` and
 *  `inspect(path)` (→ parseWorktreeState() or MISSING_WORKTREE) are called only for rows that
 *  need them. Rows: { kind, path?, branch, remove, reason }. */
export function plan({
  worktrees,
  branches,
  mergedHeads,
  inMain,
  inspect,
  worktreesDir,
  currentPath,
}) {
  const decide = (name) => {
    if (PROTECTED_BRANCHES.has(name)) return { remove: false, reason: "protected branch" };
    const info = branches.get(name);
    if (!info) return { remove: false, reason: "branch not found" };
    return branchVerdict({ ...info, inMain: () => inMain(name) }, mergedHeads.get(name));
  };

  const worktreeSkip = (wt) => {
    if (!wt.path.startsWith(`${worktreesDir}/`)) return "outside .worktrees/";
    if (wt.path === currentPath) return "current worktree";
    if (wt.locked) return "locked";
    if (!wt.branch) return "detached HEAD";
    const state = inspect(wt.path);
    if (wt.prunable) return state.exists ? "stale directory, inspect by hand" : null;
    return worktreeBlocker(state);
  };

  const rows = worktrees.slice(1).map((wt) => {
    const skip = worktreeSkip(wt);
    const verdict = skip ? { remove: false, reason: skip } : decide(wt.branch);
    return { kind: "worktree", path: wt.path, branch: wt.branch, ...verdict };
  });

  // A rebase or bisect detaches HEAD, so the branch it works on is listed in `busyBranches`.
  const checkedOut = new Set(worktrees.flatMap((wt) => [wt.branch, ...(wt.busyBranches ?? [])]));
  for (const name of branches.keys()) {
    if (!checkedOut.has(name)) rows.push({ kind: "branch", branch: name, ...decide(name) });
  }
  return rows;
}
