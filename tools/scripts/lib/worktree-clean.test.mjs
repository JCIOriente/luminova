import { test } from "node:test";
import assert from "node:assert/strict";
import {
  branchVerdict,
  mergedHeadsByBranch,
  parseBranches,
  MISSING_WORKTREE,
  parseWorktreeState,
  worktreeBlocker,
  parseWorktrees,
  plan,
  touchedPathDiffers,
} from "./worktree-clean.mjs";

const ROOT = "/repo";
const WT = `${ROOT}/.worktrees`;

test("parses -z porcelain worktrees, primary first", () => {
  const nul = (...lines) => lines.join("\0");
  const output = [
    nul(`worktree ${ROOT}`, "HEAD a", "branch refs/heads/main"),
    nul(`worktree ${WT}/with space`, "HEAD b", "branch refs/heads/feat/one"),
    nul(`worktree ${WT}/loose`, "HEAD c", "detached"),
    nul(`worktree ${WT}/gone`, "HEAD d", "branch refs/heads/fix/gone", "prunable gitdir missing"),
    nul(`worktree ${WT}/held`, "HEAD e", "branch refs/heads/fix/held", "locked"),
  ].join("\0\0");
  assert.deepEqual(parseWorktrees(`${output}\0\0`), [
    { path: ROOT, branch: "main", prunable: false, locked: false },
    { path: `${WT}/with space`, branch: "feat/one", prunable: false, locked: false },
    { path: `${WT}/loose`, branch: null, prunable: false, locked: false },
    { path: `${WT}/gone`, branch: "fix/gone", prunable: true, locked: false },
    { path: `${WT}/held`, branch: "fix/held", prunable: false, locked: true },
  ]);
});

test("parses branches with their upstream state", () => {
  const out = "main\0aaa\0\nfeat/one\0bbb\0[gone]\nfeat/two\0ccc\0[ahead 1]\n";
  assert.deepEqual(
    [...parseBranches(out)],
    [
      ["main", { tip: "aaa", upstreamGone: false }],
      ["feat/one", { tip: "bbb", upstreamGone: true }],
      ["feat/two", { tip: "ccc", upstreamGone: false }],
    ],
  );
});

test("a reused branch name keeps every merged head", () => {
  const heads = mergedHeadsByBranch([
    { headRefName: "feat/x", headRefOid: "a" },
    { headRefName: "feat/x", headRefOid: "b" },
  ]);
  assert.deepEqual([...heads.get("feat/x")], ["a", "b"]);
});

test("state: build output is not precious; .env.local, untracked files and refs are", () => {
  const clean =
    "!! node_modules/\0!! apps/web/dist/\0!! apps/web/.turbo/\0!! x-debug.log\0!! .firebaserc\0";
  assert.deepEqual(parseWorktreeState({ status: clean }), {
    exists: true,
    dirty: false,
    ignored: [],
    localRefs: [],
  });
  assert.deepEqual(
    parseWorktreeState({ status: "!! apps/web/.env.local\0!! node_modules/\0" }).ignored,
    ["apps/web/.env.local"],
  );
  assert.equal(parseWorktreeState({ status: "?? notes.txt\0" }).dirty, true);
  assert.equal(parseWorktreeState({ status: " M a.ts\0" }).dirty, true);
  assert.deepEqual(parseWorktreeState({ status: "", refs: "refs/worktree/keep\n" }).localRefs, [
    "refs/worktree/keep",
  ]);
});

test("state: a brand/local/ the caller found rebuildable is not precious; otherwise it is", () => {
  const status = "!! brand/local/\0!! node_modules/\0";
  assert.deepEqual(parseWorktreeState({ status }).ignored, ["brand/local/"]);
  assert.deepEqual(parseWorktreeState({ status, rebuildable: ["brand/local/"] }).ignored, []);
  assert.deepEqual(
    parseWorktreeState({
      status: `${status}!! apps/web/.env.local\0`,
      rebuildable: ["brand/local/"],
    }).ignored,
    ["apps/web/.env.local"],
  );
});

test("state: assume-unchanged and skip-worktree files count as dirty", () => {
  const dirtyFor = (lsFiles) => parseWorktreeState({ status: "", lsFiles }).dirty;
  assert.equal(dirtyFor("H a.ts\nH b.ts\n"), false);
  assert.equal(dirtyFor("H a.ts\nh b.ts\n"), true);
  assert.equal(dirtyFor("S sparse.ts\n"), true);
});

test("blocker names the first reason a worktree must stay", () => {
  assert.equal(worktreeBlocker(MISSING_WORKTREE), null);
  assert.equal(
    worktreeBlocker({ ...MISSING_WORKTREE, dirty: true, ignored: ["x"] }),
    "uncommitted changes",
  );
  assert.equal(
    worktreeBlocker({ ...MISSING_WORKTREE, ignored: [".env.local"] }),
    "ignored files: .env.local",
  );
  assert.equal(
    worktreeBlocker({ ...MISSING_WORKTREE, localRefs: ["refs/bisect/bad"] }),
    "worktree-local refs: refs/bisect/bad",
  );
});

test("only differences in paths the branch touched count", () => {
  const touched = new Set(["a.txt", "lib/f"]);
  assert.equal(touchedPathDiffers(touched, ["other.txt", "lib/g"]), false);
  assert.equal(touchedPathDiffers(touched, ["a.txt"]), true);
  assert.equal(touchedPathDiffers(touched, ["lib/f/now-a-dir.txt"]), true);
  assert.equal(touchedPathDiffers(touched, ["lib/fx"]), false);
  assert.equal(touchedPathDiffers(new Set(), ["a.txt"]), false);
});

const heads = new Set(["s1"]);
const verdictCases = [
  [
    "a merged PR head lands even when main has moved on",
    { tip: "s1", upstreamGone: true, landed: false },
    heads,
    true,
    "merged PR head",
  ],
  [
    "a deleted remote whose merge changes nothing has landed",
    { tip: "r", upstreamGone: true, landed: true },
    undefined,
    true,
    "in origin/main",
  ],
  [
    "a deleted remote with content main lacks is kept",
    { tip: "r", upstreamGone: true, landed: false },
    undefined,
    false,
    "remote deleted, has changes main lacks",
  ],
  [
    "a fresh branch off main is kept although its merge changes nothing",
    { tip: "m", upstreamGone: false, landed: true },
    undefined,
    false,
    "no merged PR",
  ],
  [
    "a reused name with no new commits is kept while its remote exists",
    { tip: "m", upstreamGone: false, landed: true },
    heads,
    false,
    "not at a merged PR head",
  ],
];
for (const [name, { tip, upstreamGone, landed }, prHeads, remove, reason] of verdictCases) {
  test(name, () => {
    assert.deepEqual(branchVerdict({ tip, upstreamGone, inMain: () => landed }, prHeads), {
      remove,
      reason,
    });
  });
}

test("the content check is skipped when the PR head already decides", () => {
  const inMain = () => assert.fail("merge-tree should not run");
  branchVerdict({ tip: "s1", upstreamGone: true, inMain }, heads);
  branchVerdict({ tip: "x", upstreamGone: false, inMain }, undefined);
});

const wt = (slug, branch, extra = {}) => ({
  path: slug.startsWith("/") ? slug : `${WT}/${slug}`,
  branch,
  prunable: false,
  locked: false,
  ...extra,
});

const present = { ...MISSING_WORKTREE, exists: true };

function scenario(overrides = {}) {
  const states = {
    [`${WT}/dirty`]: { ...present, dirty: true },
    [`${WT}/env`]: { ...present, ignored: ["apps/web/.env.local"] },
    [`${WT}/stale`]: present,
    [`${WT}/refs`]: { ...present, localRefs: ["refs/worktree/keep"] },
  };
  return {
    worktrees: [
      wt(ROOT, "main"),
      wt("done", "feat/done"),
      wt("dirty", "feat/done2"),
      wt("env", "feat/done3"),
      wt("here", "feat/here"),
      wt("loose", null),
      wt("held", "feat/held", { locked: true }),
      wt(`${ROOT}/.claude/worktrees/x`, "feat/x"),
      wt(`${WT}-old/y`, "feat/y"),
      wt("missing", "feat/missing", { prunable: true }),
      wt("stale", "feat/stale", { prunable: true }),
      wt("refs", "feat/refs"),
    ],
    branches: new Map(
      [
        "main",
        "feat/done",
        "feat/done2",
        "feat/done3",
        "feat/here",
        "feat/held",
        "feat/x",
        "feat/y",
        "feat/missing",
        "feat/stale",
        "feat/refs",
        "chore/local",
        "feat/old",
      ].map((name) => [
        name,
        { tip: name, upstreamGone: name !== "chore/local" && name !== "main" },
      ]),
    ),
    mergedHeads: new Map(),
    inMain: (name) => name !== "feat/y",
    inspect: (path) =>
      states[path] ?? {
        exists: !path.endsWith("missing"),
        dirty: false,
        ignored: [],
        localRefs: [],
      },
    worktreesDir: WT,
    currentPath: `${WT}/here`,
    ...overrides,
  };
}

const verdicts = (rows) => rows.map((r) => [r.kind, r.branch, r.remove, r.reason]);

test("plan removes only clean, landed worktrees under .worktrees/", () => {
  const rows = plan(scenario()).filter((r) => r.kind === "worktree");
  assert.deepEqual(verdicts(rows), [
    ["worktree", "feat/done", true, "in origin/main"],
    ["worktree", "feat/done2", false, "uncommitted changes"],
    ["worktree", "feat/done3", false, "ignored files: apps/web/.env.local"],
    ["worktree", "feat/here", false, "current worktree"],
    ["worktree", null, false, "detached HEAD"],
    ["worktree", "feat/held", false, "locked"],
    ["worktree", "feat/x", false, "outside .worktrees/"],
    ["worktree", "feat/y", false, "outside .worktrees/"],
    ["worktree", "feat/missing", true, "in origin/main"],
    ["worktree", "feat/stale", false, "stale directory, inspect by hand"],
    ["worktree", "feat/refs", false, "worktree-local refs: refs/worktree/keep"],
  ]);
});

test("branches no worktree has checked out get their own rows", () => {
  const rows = plan(scenario()).filter((r) => r.kind === "branch");
  assert.deepEqual(verdicts(rows), [
    ["branch", "chore/local", false, "no merged PR"],
    ["branch", "feat/old", true, "in origin/main"],
  ]);
});

test("a branch under rebase or bisect in a detached worktree gets no branch row", () => {
  const s = scenario();
  s.worktrees.push(wt("rebasing", null, { busyBranches: ["feat/old"] }));
  assert.ok(!plan(s).some((r) => r.kind === "branch" && r.branch === "feat/old"));
});

test("main is protected even when no worktree has it checked out", () => {
  const s = scenario();
  s.worktrees[0] = wt(ROOT, "feat/other");
  const main = plan(s).find((r) => r.branch === "main");
  assert.deepEqual([main.remove, main.reason], [false, "protected branch"]);
});

test("a kept worktree's branch is never judged on its own", () => {
  const probed = [];
  const rows = plan(scenario({ inMain: (name) => (probed.push(name), true) }));
  const kept = [
    "feat/done2",
    "feat/done3",
    "feat/here",
    "feat/held",
    "feat/x",
    "feat/y",
    "feat/stale",
    "feat/refs",
  ];
  for (const name of kept) {
    assert.ok(!probed.includes(name), `${name} was judged`);
    assert.ok(!rows.some((r) => r.branch === name && r.remove), `${name} would be removed`);
  }
  assert.deepEqual(probed, ["feat/done", "feat/missing", "feat/old"]);
});
