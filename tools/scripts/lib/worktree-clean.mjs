// Which worktrees and local branches `pnpm wt:clean` may delete. Pure: the CLI gathers git and
// gh state, this decides. A branch is deletable only when nothing on it would be lost.
// Squash merges are allowed, so "tip is in origin/main" alone misses most merged branches.
// The merged PR's head commit is the other proof.

const PROTECTED_BRANCHES = new Set(["main", "master"]);

/** `git worktree list --porcelain` → [{ path, head, branch, detached, prunable }]. The first
 *  entry is the primary checkout. */
export function parseWorktrees(porcelain) {
  return porcelain
    .split("\n\n")
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const entry = { path: "", head: "", branch: null, detached: false, prunable: false };
      for (const line of block.split("\n")) {
        const [key, ...rest] = line.split(" ");
        const value = rest.join(" ");
        if (key === "worktree") entry.path = value;
        else if (key === "HEAD") entry.head = value;
        else if (key === "branch") entry.branch = value.replace(/^refs\/heads\//, "");
        else if (key === "detached") entry.detached = true;
        else if (key === "prunable") entry.prunable = true;
      }
      return entry;
    });
}

/** `git for-each-ref --format='%(refname:short)%00%(objectname)%00%(upstream:track)' refs/heads`
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

/** `gh pr list --state merged --json headRefName,headRefOid` → Map<branch, Set<oid>>. A name
 *  can be reused, so one branch may have several merged heads. */
export function mergedHeadsByBranch(prs) {
  const heads = new Map();
  for (const { headRefName, headRefOid } of prs) {
    if (!heads.has(headRefName)) heads.set(headRefName, new Set());
    heads.get(headRefName).add(headRefOid);
  }
  return heads;
}

/** Why a branch's commits are safe to drop, or null when they are not.
 *  `inMain`: the tip is an ancestor of origin/main. That alone is not enough: a branch freshly
 *  cut from origin/main is "in main" before its first commit.
 *  `patchesInMain`: `git cherry` finds every commit's patch in origin/main (rebase merges and
 *  rebased PRs give the same changes new SHAs). Same guard as `inMain`. */
export function landedReason(
  { branch, tip, upstreamGone, inMain, patchesInMain = false },
  mergedHeads,
) {
  const heads = mergedHeads.get(branch);
  if (heads?.has(tip)) return "merged PR head";
  if (!heads && !upstreamGone) return null;
  if (inMain) return "in origin/main";
  if (patchesInMain) return "rebased into origin/main";
  return null;
}

function keepReason({ inMain, upstreamGone }, mergedHeads, branch) {
  if (mergedHeads.has(branch)) return "commits after its merged PR";
  if (upstreamGone) return "remote deleted, commits not in origin/main or a merged PR";
  if (inMain) return "no commits yet";
  return "no merged PR";
}

/** Decide every worktree under `worktreesDir` and, with `includeBranches`, every other local
 *  branch. `worktrees[0]` is the primary checkout. Returns rows in input order:
 *  { kind: "worktree" | "branch", path?, branch, remove, reason }. */
export function plan({
  worktrees,
  branches,
  mergedHeads,
  inMain,
  patchesInMain = new Set(),
  dirty,
  worktreesDir,
  currentPath,
  includeBranches = false,
}) {
  const rows = [];
  const checkedOut = new Set();
  const [primary, ...linked] = worktrees;
  if (primary?.branch) checkedOut.add(primary.branch);

  const branchVerdict = (name) => {
    if (PROTECTED_BRANCHES.has(name)) return { remove: false, reason: "protected branch" };
    const info = branches.get(name);
    if (!info) return { remove: false, reason: "branch not found" };
    const facts = {
      branch: name,
      ...info,
      inMain: inMain.has(name),
      patchesInMain: patchesInMain.has(name),
    };
    const landed = landedReason(facts, mergedHeads);
    return landed
      ? { remove: true, reason: landed }
      : { remove: false, reason: keepReason(facts, mergedHeads, name) };
  };

  for (const wt of linked) {
    if (wt.branch) checkedOut.add(wt.branch);
    const row = { kind: "worktree", path: wt.path, branch: wt.branch };
    const inside = wt.path.startsWith(
      worktreesDir.endsWith("/") ? worktreesDir : `${worktreesDir}/`,
    );
    if (!inside) rows.push({ ...row, remove: false, reason: "outside .worktrees/" });
    else if (wt.path === currentPath)
      rows.push({ ...row, remove: false, reason: "current worktree" });
    else if (!wt.branch) rows.push({ ...row, remove: false, reason: "detached HEAD" });
    else if (!wt.prunable && dirty.has(wt.path))
      rows.push({ ...row, remove: false, reason: "uncommitted changes" });
    else rows.push({ ...row, ...branchVerdict(wt.branch) });
  }

  if (includeBranches) {
    for (const name of branches.keys()) {
      if (checkedOut.has(name)) continue;
      rows.push({ kind: "branch", branch: name, ...branchVerdict(name) });
    }
  }
  return rows;
}
