# 0010. Computed review routing and worktree-first

**Status:** Accepted
**Date:** 2026-06-12 (branch guard, worktree-first); review router followed
**Source:** `docs/status/2026-06-12-feature-flow-harness.md`; `CLAUDE.md`
("Review routing (BINDING)"); `.claude/review-routing.json`;
`.claude/hooks/review-route.mjs`, `review-gate.sh`, `review-router.sh`,
`branch-guard.sh`.

## Context

This repository is developed largely through AI-assisted sessions, by a small number of
maintainers, across an annually rotating volunteer organization. Two failure modes
follow from that and neither is solved by discipline:

1. **"This diff looks simple."** Deciding per-PR which reviews a change owes means the
   decision is made by whoever is most eager to merge, at the moment they are most
   eager. Security reviews get skipped exactly when they matter.
2. **Uncommitted work in the primary checkout.** Parallel work, a switched branch under
   someone's feet, half-finished edits mixed into an unrelated change.

## Decision

**Review routing is computed, not judged.** `.claude/review-routing.json` is a rubric;
`.claude/hooks/review-route.mjs` evaluates it against the diff. **Same diff → same
review set, every time.** "The diff looks simple" is not an input — the rubric already
accounts for size through line thresholds.

Evidence is a git **trailer** stamped on a commit in range, naming the review set. It is
honoured only while nothing in that review's scope changes after its sha; a later commit
touching those paths invalidates it.

Enforcement is layered:

| Guard | Event | Behaviour |
|---|---|---|
| `branch-guard.sh` | `git commit` | **Hard-blocks** commits on `main`/`master`, ignoring `--no-verify` |
| `pre-commit.sh` | `git commit` | Auto-fixes formatting and re-stages; blocks only if lint/typecheck still fail |
| `review-gate.sh` | `gh pr create` | **Hard-blocks** without a fresh trailer covering the rules marked `gate: "hard"` |
| `review-router.sh` | after `gh pr create` | Prints the mandated set — advisory counterpart |

**Worktree-first** is mandatory: every change, including tooling- and docs-only ones,
runs in `.worktrees/<slug>` off `main`, created **before the first edit**.

Changing the rubric changes the contract: `.claude/review-routing.json` and its fixture
tests move together.

## Consequences

**Easy:** review coverage is reproducible and auditable from the git log; the gate
cannot be argued with; parallel work never collides; `main` stays deployable.

**Hard:**

- **A rebase invalidates the stamp.** The trailer's sha stops being a HEAD ancestor, so
  it must be re-stamped. Same for a stacked PR that auto-retargets when its base merges.
- **The trailer must be in the commit message's last paragraph**, sharing it with
  `Co-Authored-By` — git only parses trailers there. Prose after the trailer silently
  voids it.
- **Hooks run from the worktree the PR runs from**, not the primary checkout. Committing
  hook edits from a worktree needs the tool's working directory set into it; the guard
  reads the Bash cwd, not an inline `cd`.
- **Fresh worktrees pay a setup cost** — `pnpm install` and a packages build before
  tests will run ([0002](0002-monorepo-turborepo-pnpm.md)).

**Important scoping limit:** `branch-guard.sh` and `review-gate.sh` are **Claude Code
session hooks, not git hooks.** The repository ships no git hook, so nothing stops an
outside contributor committing to `main` locally. `CONTRIBUTING.md` states this
honestly and asks contributors to branch anyway. The guards bind maintainers working in
this harness; they are not a repository-wide control, and documenting them as one would
be the exact false-guard failure that guardrail 6 names.

**Ruled out:** per-PR judgment about which reviews are needed; hand-written review
assessments in place of running the mandated review.
