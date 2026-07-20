#!/usr/bin/env node
// Deterministic review router: diff facts -> the review set that MUST run.
//
// Rubric lives in .claude/review-routing.json (single source of truth); this
// file only evaluates it. Consumers: review-router.sh (advisory checklist on
// `gh pr create`) and review-gate.sh (hard gate on the security class).
// Keeping the path sets out of the hooks is the point — the two shells used to
// carry copy-pasted regexes that could silently drift apart.
//
// stdin : `git diff --numstat <base>...HEAD` output (added\tremoved\tpath).
//         Binary files report `-` for the counts; treated as 0 changed lines.
// stdout: --format json (default) | text (agent-facing checklist)
// argv  : [--format json|text] [--gate-only]  (--gate-only => hard-gate tokens only)
//
// The gate asks the SAME question twice: `--gate-only` over the branch diff says
// whether a hard review is owed, and `--gate-only` over `<reviewed-sha>..HEAD`
// says whether the stamp is stale. One evaluator, so gate and checklist can
// never disagree about what counts as security-sensitive.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const RUBRIC_PATH = join(here, "..", "review-routing.json");

const argv = process.argv.slice(2);
const format = argv.includes("--format") ? argv[argv.indexOf("--format") + 1] : "json";
const gateOnly = argv.includes("--gate-only");

/** git's rename shorthand: `a/{old => new}/c.ts` and `old.ts => new.ts`. Expand
 *  to both sides so a rename INTO a sensitive path still routes. */
function expandPath(raw) {
  const brace = raw.match(/^(.*)\{(.*) => (.*)\}(.*)$/);
  if (brace) {
    const [, pre, from, to, post] = brace;
    return [
      `${pre}${from}${post}`.replace(/\/\//g, "/"),
      `${pre}${to}${post}`.replace(/\/\//g, "/"),
    ];
  }
  const arrow = raw.split(" => ");
  return arrow.length === 2 ? arrow : [raw];
}

function parseNumstat(text) {
  const files = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const [addedRaw, removedRaw, ...rest] = line.split("\t");
    const raw = rest.join("\t");
    if (!raw) continue;
    const added = addedRaw === "-" ? 0 : Number(addedRaw) || 0;
    const removed = removedRaw === "-" ? 0 : Number(removedRaw) || 0;
    for (const path of expandPath(raw)) files.push({ path, added, removed });
  }
  return files;
}

const anyMatch = (patterns, path) => (patterns || []).some((p) => new RegExp(p).test(path));

/** Files a rule is scoped to: matches `paths`, not excluded by `exceptPaths`. */
function scopedFiles(rule, files) {
  return files.filter((f) => anyMatch(rule.paths, f.path) && !anyMatch(rule.exceptPaths, f.path));
}

function evaluate(rubric, files) {
  const lighter =
    files.length > 0 && files.every((f) => anyMatch(rubric.lighterReview.paths, f.path));

  const matched = [];
  for (const rule of rubric.rules) {
    let hits = scopedFiles(rule, files);

    if (rule.minChangedLines != null) {
      const changed = hits.reduce((n, f) => n + f.added + f.removed, 0);
      if (changed < rule.minChangedLines) hits = [];
    }

    if (!hits.length && rule.alsoWhen) {
      const alt = files.filter((f) => anyMatch(rule.alsoWhen.paths, f.path));
      const added = alt.reduce((n, f) => n + f.added, 0);
      if (added >= (rule.alsoWhen.addedLinesAtLeast ?? Infinity)) hits = alt;
    }

    if (!hits.length) continue;
    matched.push({
      token: rule.token,
      kind: rule.kind,
      invoke: rule.invoke,
      gate: rule.gate ?? "advisory",
      why: rule.why,
      exempt: rule._exempt,
      // Cap the evidence list: a 200-file diff must not flood the hook output.
      triggeredBy: hits.slice(0, 8).map((f) => f.path),
      triggeredByCount: hits.length,
    });
  }

  // Three verdicts, never two. `minor` is the one that bit PR #187: a handful of
  // sub-threshold non-test lines is neither "test-only" nor "route the full set",
  // and without its own verdict it printed as an unexplained zero — which reads as
  // "no review needed" and is exactly the silent skip this router exists to stop.
  const verdict = !files.length
    ? "empty"
    : lighter
      ? "lighter"
      : matched.length
        ? "routed"
        : "minor";

  return { verdict, lighter, files: files.length, reviews: matched };
}

const EXCEPTION_TERMS = [
  "Full review skills MAY be skipped. They are not skipped silently:",
  "  1. put `Review-Exception: <reason>` in the PR body",
  "  2. record the correctness gate — full test sweep + the invariant you assert",
  '     (e.g. "zero refs remain"), with the command output.',
];

function toText(result) {
  const { reviews, verdict } = result;
  if (verdict === "empty") return "review-router: empty diff — nothing to route.";

  if (verdict === "lighter") {
    return [
      "REVIEW ROUTING — lighter review allowed (test-only / docs-only diff).",
      "",
      ...EXCEPTION_TERMS,
    ].join("\n");
  }

  if (verdict === "minor") {
    return [
      "REVIEW ROUTING — lighter review allowed (source changed, but under the",
      "code-review line threshold and outside every sensitive path).",
      "",
      ...EXCEPTION_TERMS,
    ].join("\n");
  }

  const hard = reviews.filter((r) => r.gate === "hard");
  const soft = reviews.filter((r) => r.gate !== "hard");
  const line = (r) =>
    `  - ${r.invoke}${r.kind === "subagent" ? "" : ""} — ${r.why}` +
    `\n      triggered by: ${r.triggeredBy.join(", ")}` +
    (r.triggeredByCount > r.triggeredBy.length
      ? ` (+${r.triggeredByCount - r.triggeredBy.length} more)`
      : "") +
    (r.exempt ? `\n      exempt: ${r.exempt}` : "");

  const out = [`REVIEW ROUTING — this diff MUST get ${reviews.length} review(s). Not optional:`];
  if (hard.length) {
    out.push("", "ENFORCED (PR create is blocked without a fresh trailer):", ...hard.map(line));
  }
  if (soft.length) {
    out.push(
      "",
      "REQUIRED (not shell-enforced — the contract binds you, run them):",
      ...soft.map(line),
    );
  }
  out.push(
    "",
    "When they are all done, stamp one trailer on a commit in range:",
    `  git commit --allow-empty -m 'chore: reviews' -m 'Reviews: <HEAD-sha> ${reviews
      .map((r) => r.token)
      .join(",")}'`,
    'and list the same set in the PR body under "## Reviews".',
  );
  return out.join("\n");
}

let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (stdin += d));
process.stdin.on("end", () => {
  const rubric = JSON.parse(readFileSync(RUBRIC_PATH, "utf8"));
  const result = evaluate(rubric, parseNumstat(stdin));
  if (gateOnly) result.reviews = result.reviews.filter((r) => r.gate === "hard");
  process.stdout.write(format === "text" ? toText(result) + "\n" : JSON.stringify(result));
});
