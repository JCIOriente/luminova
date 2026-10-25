import { test } from "node:test";
import assert from "node:assert/strict";
import {
  landedReason,
  mergedHeadsByBranch,
  parseBranches,
  parseWorktrees,
  plan,
} from "./worktree-clean.mjs";

const ROOT = "/repo";
const WT = `${ROOT}/.worktrees`;

test("parses porcelain worktrees, primary first", () => {
  const porcelain = [
    `worktree ${ROOT}\nHEAD aaa\nbranch refs/heads/main`,
    `worktree ${WT}/one\nHEAD bbb\nbranch refs/heads/feat/one`,
    `worktree ${WT}/two\nHEAD ccc\ndetached`,
    `worktree ${WT}/gone\nHEAD ddd\nbranch refs/heads/fix/gone\nprunable gitdir file points to non-existent location`,
  ].join("\n\n");
  assert.deepEqual(parseWorktrees(`${porcelain}\n`), [
    { path: ROOT, head: "aaa", branch: "main", detached: false, prunable: false },
    { path: `${WT}/one`, head: "bbb", branch: "feat/one", detached: false, prunable: false },
    { path: `${WT}/two`, head: "ccc", branch: null, detached: true, prunable: false },
    { path: `${WT}/gone`, head: "ddd", branch: "fix/gone", detached: false, prunable: true },
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

const merged = mergedHeadsByBranch([{ headRefName: "feat/squashed", headRefOid: "s1" }]);

test("a squash-merged branch lands by its PR head even though it is not in main", () => {
  const facts = { branch: "feat/squashed", tip: "s1", upstreamGone: true, inMain: false };
  assert.equal(landedReason(facts, merged), "merged PR head");
});

test("commits after the merged PR keep the branch", () => {
  const facts = { branch: "feat/squashed", tip: "s2", upstreamGone: true, inMain: false };
  assert.equal(landedReason(facts, merged), null);
});

test("a branch fresh off origin/main is in main but has not landed", () => {
  const facts = { branch: "feat/new", tip: "m", upstreamGone: false, inMain: true };
  assert.equal(landedReason(facts, merged), null);
});

test("a tip in main lands once its remote was deleted", () => {
  const facts = { branch: "feat/merged", tip: "m", upstreamGone: true, inMain: true };
  assert.equal(landedReason(facts, merged), "in origin/main");
});

test("a tip in main lands when the branch had a merged PR", () => {
  const facts = { branch: "feat/squashed", tip: "older", upstreamGone: false, inMain: true };
  assert.equal(landedReason(facts, merged), "in origin/main");
});

test("a rebase-merged branch lands when every patch is in main", () => {
  const facts = {
    branch: "feat/rebased",
    tip: "r",
    upstreamGone: true,
    inMain: false,
    patchesInMain: true,
  };
  assert.equal(landedReason(facts, merged), "rebased into origin/main");
});

test("patches in main do not land a branch that was never pushed or merged", () => {
  const facts = {
    branch: "chore/local",
    tip: "l",
    upstreamGone: false,
    inMain: false,
    patchesInMain: true,
  };
  assert.equal(landedReason(facts, merged), null);
});

test("an unpushed branch with no PR is kept", () => {
  const facts = { branch: "chore/local", tip: "l", upstreamGone: false, inMain: false };
  assert.equal(landedReason(facts, merged), null);
});

function scenario(overrides = {}) {
  const worktrees = [
    { path: ROOT, head: "m", branch: "main", detached: false, prunable: false },
    { path: `${WT}/done`, head: "s1", branch: "feat/squashed", detached: false, prunable: false },
    { path: `${WT}/dirty`, head: "s1", branch: "feat/dirty", detached: false, prunable: false },
    { path: `${WT}/here`, head: "h", branch: "feat/here", detached: false, prunable: false },
    { path: `${WT}/loose`, head: "d", branch: null, detached: true, prunable: false },
    {
      path: `${ROOT}/.claude/worktrees/x`,
      head: "x",
      branch: "feat/x",
      detached: false,
      prunable: false,
    },
    { path: `${WT}/missing`, head: "p", branch: "feat/missing", detached: false, prunable: true },
  ];
  const branches = parseBranches(
    [
      "main\0m\0",
      "feat/squashed\0s1\0[gone]",
      "feat/dirty\0s1\0[gone]",
      "feat/here\0h\0[gone]",
      "feat/x\0x\0[gone]",
      "feat/missing\0p\0[gone]",
      "chore/local\0l\0",
      "feat/old\0o\0[gone]",
    ].join("\n"),
  );
  return {
    worktrees,
    branches,
    mergedHeads: mergedHeadsByBranch([
      { headRefName: "feat/squashed", headRefOid: "s1" },
      { headRefName: "feat/dirty", headRefOid: "s1" },
      { headRefName: "feat/here", headRefOid: "h" },
      { headRefName: "feat/x", headRefOid: "x" },
      { headRefName: "feat/missing", headRefOid: "p" },
    ]),
    inMain: new Set(["main", "feat/old"]),
    dirty: new Set([`${WT}/dirty`, `${WT}/missing`]),
    worktreesDir: WT,
    currentPath: `${WT}/here`,
    ...overrides,
  };
}

const verdicts = (rows) => rows.map((r) => [r.kind, r.branch, r.remove, r.reason]);

test("plan removes only clean, landed worktrees under .worktrees/", () => {
  assert.deepEqual(verdicts(plan(scenario())), [
    ["worktree", "feat/squashed", true, "merged PR head"],
    ["worktree", "feat/dirty", false, "uncommitted changes"],
    ["worktree", "feat/here", false, "current worktree"],
    ["worktree", null, false, "detached HEAD"],
    ["worktree", "feat/x", false, "outside .worktrees/"],
    ["worktree", "feat/missing", true, "merged PR head"],
  ]);
});

test("a sibling directory sharing the prefix is not inside .worktrees/", () => {
  const rows = plan(
    scenario({
      worktrees: [
        { path: ROOT, head: "m", branch: "main", detached: false, prunable: false },
        {
          path: `${WT}-old/a`,
          head: "s1",
          branch: "feat/squashed",
          detached: false,
          prunable: false,
        },
      ],
    }),
  );
  assert.deepEqual(verdicts(rows), [["worktree", "feat/squashed", false, "outside .worktrees/"]]);
});

test("--branches adds branches no worktree has checked out, never main", () => {
  const rows = plan(scenario({ includeBranches: true })).filter((r) => r.kind === "branch");
  assert.deepEqual(verdicts(rows), [
    ["branch", "chore/local", false, "no merged PR"],
    ["branch", "feat/old", true, "in origin/main"],
  ]);
});

test("main is protected even when it is not the primary checkout's branch", () => {
  const s = scenario({ includeBranches: true });
  s.worktrees[0] = { ...s.worktrees[0], branch: "feat/other" };
  const main = plan(s).find((r) => r.branch === "main");
  assert.deepEqual([main.remove, main.reason], [false, "protected branch"]);
});

test("keep reasons say why a branch stays", () => {
  const rows = plan(
    scenario({
      worktrees: [{ path: ROOT, head: "m", branch: "main", detached: false, prunable: false }],
      branches: parseBranches(
        ["feat/squashed\0s9\0[gone]", "feat/abandoned\0a\0[gone]", "feat/new\0m\0"].join("\n"),
      ),
      inMain: new Set(["feat/new"]),
      includeBranches: true,
    }),
  );
  assert.deepEqual(verdicts(rows), [
    ["branch", "feat/squashed", false, "commits after its merged PR"],
    [
      "branch",
      "feat/abandoned",
      false,
      "remote deleted, commits not in origin/main or a merged PR",
    ],
    ["branch", "feat/new", false, "no commits yet"],
  ]);
});
