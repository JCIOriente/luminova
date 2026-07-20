#!/usr/bin/env node
// Deterministic review router: diff facts -> the review set that MUST run.
//
// Rubric lives in .claude/review-routing.json (single source of truth); this
// file only evaluates it. Consumers: route.sh (manual, pre-PR), review-router.sh
// (advisory checklist after `gh pr create`) and review-gate.sh (hard gate).
// Keeping the path sets, the trailer vocabulary and the exception terms out of
// the shells is the point — they used to be copy-pasted and could drift apart.
//
// stdin : `git diff --numstat <base>...HEAD` output (added\tremoved\tpath).
//         Binary files report `-` for the counts; treated as 0 changed lines.
// argv  : --format json    (default) full evaluation
//         --format text    agent-facing checklist
//         --format tokens  one token per line (shells consume this directly, so
//                          no second node process is needed just to parse JSON)
//         --gate-only      restrict to the rubric's hard-gated rules
//         --trailer-keys   print the rubric's trailer keys, current first, and
//                          exit; stdin is not read. The shell asks the rubric
//                          for the key names instead of hardcoding them.
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
// lastIndexOf, not indexOf: hook_route_tokens appends its own `--format tokens`
// after caller args, so a caller passing --format would otherwise win and hand
// the gate a prose blob where it expects tokens — blocking every PR.
const format = argv.includes("--format") ? argv[argv.lastIndexOf("--format") + 1] : "json";
const gateOnly = argv.includes("--gate-only");

const rubric = JSON.parse(readFileSync(RUBRIC_PATH, "utf8"));

if (argv.includes("--trailer-keys")) {
  process.stdout.write([rubric.trailerKey, ...(rubric.legacyTrailerKeys ?? [])].join("\n"));
  process.exit(0);
}

/** Resolve a rule's inline `paths` plus any `pathsRef` named sets into one
 *  matcher. An entry prefixed `!` SUBTRACTS from the set, so a set can express
 *  "prose, except the prose that is load-bearing" (`\.md$` but not CLAUDE.md)
 *  in the one place the set is defined, instead of every rule re-stating it. */
function resolveSet(rubric, inline, refs) {
  const named = (refs ?? []).flatMap((name) => {
    const set = rubric.pathSets?.[name];
    if (!set) throw new Error(`review-route: unknown pathSet '${name}'`);
    return set;
  });
  const all = [...(inline ?? []), ...named];
  return {
    include: all.filter((p) => !p.startsWith("!")),
    exclude: all.filter((p) => p.startsWith("!")).map((p) => p.slice(1)),
  };
}

const ESCAPES = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", a: "\x07" };

/** Undo git's C-style path quoting. With core.quotePath on (the default), any
 *  path holding a non-ASCII byte, a quote, a backslash or a control char is
 *  emitted as `"apps/beacon/src/\303\255ndex.ts"`. Every hard-gated pattern is
 *  start-anchored, so that leading `"` made the path match NOTHING and the gate
 *  exited 0 on an unreviewed Cloud Function — a silent fail-open, and an easy
 *  accident in a repo whose domain vocabulary is Spanish. hook_route also sets
 *  core.quotePath=false; this stays because that flag still quotes paths
 *  containing `"`, `\`, or control characters. */
function unquotePath(raw) {
  if (raw.length < 2 || !raw.startsWith('"') || !raw.endsWith('"')) return raw;
  const body = raw.slice(1, -1);
  const bytes = [];
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== "\\") {
      bytes.push(...Buffer.from(body[i], "utf8"));
      continue;
    }
    const next = body[++i];
    if (next >= "0" && next <= "7") {
      bytes.push(parseInt(body.slice(i, i + 3), 8));
      i += 2;
    } else {
      bytes.push(...Buffer.from(ESCAPES[next] ?? next, "utf8"));
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

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
    for (const path of expandPath(unquotePath(raw))) files.push({ path, added, removed });
  }
  return files;
}

const anyMatch = (patterns, path) => patterns.some((p) => new RegExp(p).test(path));

/** A path is in a resolved set when something includes it and nothing subtracts it. */
const inSet = (set, path) => anyMatch(set.include, path) && !anyMatch(set.exclude, path);

function evaluate(rubric, files, { gateOnly }) {
  const lighterPaths = resolveSet(
    rubric,
    rubric.lighterReview.paths,
    rubric.lighterReview.pathsRef,
  );
  const lighter = files.length > 0 && files.every((f) => inSet(lighterPaths, f.path));

  const rules = rubric.rules.filter((r) => !gateOnly || r.gate === "hard");
  const matched = [];
  for (const rule of rules) {
    const paths = resolveSet(rubric, rule.paths, rule.pathsRef);
    const except = resolveSet(rubric, rule.exceptPaths, rule.exceptPathsRef);
    let hits = files.filter((f) => inSet(paths, f.path) && !inSet(except, f.path));

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
      invoke: rule.invoke,
      gate: rule.gate ?? "advisory",
      why: rule.why,
      exempt: rule._exempt,
      note: rule._userInvoked,
      // Cap the evidence list: a 200-file diff must not flood the hook output.
      triggeredBy: hits.slice(0, 8).map((f) => f.path),
      triggeredByCount: hits.length,
    });
  }

  // `routed` OUTRANKS `lighter`: a diff can look docs-only and still trip a rule
  // (apps/beacon/README.md matched the auth surface), and when it did the text
  // said "reviews MAY be skipped" while the gate blocked that same evaluation.
  // A checklist that contradicts the gate teaches people to ignore the checklist.
  // `minor` is the verdict that bit PR #187: a handful of sub-threshold non-test
  // lines is neither test-only nor fully routed, and without its own verdict it
  // printed as an unexplained zero — read as "no review needed", the exact silent
  // skip this router exists to stop. Computed AFTER the gate-only filter so
  // verdict and reviews can never disagree.
  const verdict = !files.length
    ? "empty"
    : matched.length
      ? "routed"
      : lighter
        ? "lighter"
        : "minor";

  return { verdict, files: files.length, reviews: matched };
}

function toText(rubric, result) {
  const { reviews, verdict } = result;
  if (verdict === "empty") return "review-router: empty diff — nothing to route.";

  const terms = rubric.lighterReview.exceptionTerms;
  if (verdict === "lighter") {
    return [
      "REVIEW ROUTING — lighter review allowed (test-only / docs-only diff).",
      "",
      ...terms,
    ].join("\n");
  }
  if (verdict === "minor") {
    return [
      "REVIEW ROUTING — lighter review allowed (source changed, but under the",
      "code-review line threshold and outside every sensitive path).",
      "",
      ...terms,
    ].join("\n");
  }

  const hard = reviews.filter((r) => r.gate === "hard");
  const soft = reviews.filter((r) => r.gate !== "hard");
  const line = (r) =>
    `  - ${r.invoke} — ${r.why}` +
    `\n      triggered by: ${r.triggeredBy.join(", ")}` +
    (r.triggeredByCount > r.triggeredBy.length
      ? ` (+${r.triggeredByCount - r.triggeredBy.length} more)`
      : "") +
    (r.exempt ? `\n      exempt: ${r.exempt}` : "") +
    (r.note ? `\n      note: ${r.note}` : "");

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
    `  git commit --allow-empty -m 'chore: reviews' -m '${rubric.trailerKey}: <HEAD-sha> ${reviews
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
  const result = evaluate(rubric, parseNumstat(stdin), { gateOnly });
  const rendered =
    format === "text"
      ? toText(rubric, result) + "\n"
      : format === "tokens"
        ? result.reviews.map((r) => r.token).join("\n")
        : JSON.stringify(result);
  process.stdout.write(rendered);
});
