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

/** `git status --porcelain -z --ignored=matching` → { dirty, ignored }: `ignored` lists only
 *  the files a rebuild would not bring back. */
export function parseStatus(output) {
  const entries = output.split("\0").filter(Boolean);
  const ignored = entries.filter((e) => e.startsWith("!! ")).map((e) => e.slice(3));
  return {
    dirty: entries.some((e) => !e.startsWith("!! ")),
    ignored: ignored.filter((path) => !isArtifact(path)),
  };
}

/** Whether a path that differs between main and the tip is one the branch touched, or lies
 *  under one (a touched file that became a directory). */
export function touchedPathDiffers(touched, differing) {
  return differing.some((path) => {
    const parts = path.split("/");
    return parts.some((_, i) => touched.has(parts.slice(0, i + 1).join("/")));
  });
}

/** Whether a branch's commits are safe to drop. `inMain()`: origin/main already has the
 *  branch's final state of every path it touched (see the CLI). That also
 *  holds for a branch freshly cut from main, hence the deleted-remote requirement. */
export function branchVerdict({ tip, upstreamGone, inMain }, heads) {
  if (heads?.has(tip)) return { remove: true, reason: "merged PR head" };
  if (upstreamGone && inMain()) return { remove: true, reason: "in origin/main" };
  if (upstreamGone) return { remove: false, reason: "remote deleted, has changes main lacks" };
  if (heads) return { remove: false, reason: "not at a merged PR head" };
  return { remove: false, reason: "no merged PR" };
}

/** Decide every linked worktree and, with `includeBranches`, every branch no worktree has
 *  checked out. `inMain(branch)` and `inspect(path)` → { exists, dirty, ignored, localRefs } are
 *  called only for rows that need them. Rows: { kind, path?, branch, remove, reason }. */
export function plan({
  worktrees,
  branches,
  mergedHeads,
  inMain,
  inspect,
  worktreesDir,
  currentPath,
  includeBranches = false,
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
    if (state.dirty) return "uncommitted changes";
    if (state.ignored.length) return `ignored files: ${state.ignored.join(", ")}`;
    if (state.localRefs.length) return `worktree-local refs: ${state.localRefs.join(", ")}`;
    return null;
  };

  const rows = worktrees.slice(1).map((wt) => {
    const skip = worktreeSkip(wt);
    const verdict = skip ? { remove: false, reason: skip } : decide(wt.branch);
    return { kind: "worktree", path: wt.path, branch: wt.branch, ...verdict };
  });

  if (includeBranches) {
    const checkedOut = new Set(worktrees.map((wt) => wt.branch));
    for (const name of branches.keys()) {
      if (!checkedOut.has(name)) rows.push({ kind: "branch", branch: name, ...decide(name) });
    }
  }
  return rows;
}
