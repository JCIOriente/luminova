# Handoff — gate diffs the worktree, not the main checkout (PR #72)

**Date:** 2026-06-16
**Branch:** `fix/gate-worktree-cwd` → PR #72 (base `main`)
**Worktree:** `.worktrees/gate-worktree-cwd`

The HIGH-priority follow-up found while shipping PR #70. Item 1's gate
(`security-review-gate.sh`, merged in #68) was effectively dead under the repo's
own worktree-first workflow; this restores it.

## Shipped

- **`.claude/hooks/security-review-gate.sh`** — resolve the working directory
  from the PreToolUse payload's `.cwd` (fallback `CLAUDE_PROJECT_DIR`, then `.`)
  before computing the diff range. `.cwd` tracks the actual worktree, so a
  worktree-based `gh pr create` is diffed against its OWN branch instead of the
  main checkout (which stays on `main` → was diffing `main...main` = empty → gate
  never fired). Working-dir fail-open now WARNs instead of exiting silently.
- Docs: CLAUDE.md hooks-table clarifier ("diffs the worktree the PR runs from"),
  changelog entry.

## Verification

- New `.cwd` suite (`/tmp/gate-test-cwd.sh`), 4 cases — C1 `.cwd`=worktree-
  sensitive + `CLAUDE_PROJECT_DIR`=clean-main → **BLOCK** (proves `.cwd` is used,
  not env); C2 `.cwd`=clean vs env=sensitive → PASS (cwd wins); C3 no-`.cwd` →
  fallback BLOCK; C4 bad-`.cwd` → fallback BLOCK.
- Original 10-scenario suite still green (back-compat). `bash -n` OK.
- `/code-review` (opus): **clean** — `cd "$hookcwd"` double-quoted (no
  injection), fail-open consistent with merge-base path, no `set -uo pipefail`
  interaction, subdir-of-worktree resolves the right branch, no downstream
  regression.
- `.cwd` presence + worktree-tracking confirmed against the official Claude Code
  hooks docs (via claude-code-guide).
- No `/security-review` (no auth/rules/beacon). No `pnpm pr-tests` (shell+md).

## Open PRs in this track (none merged by me this session — left for review)
- **#70** — CREATE-path parity in `firestore-security-reviewer` (item 2).
- **#72** — this gate fix.
- (#68 item-1 gate already merged → `afb4dfc`; main has since advanced to #71.)

## Backlog remaining (in order; CI-red LAST per user)
3. **pr-tests port race** — turbo `ci` rules-emulator port non-serialized; pin/
   lock per run (see `feedback-pnpm-overrides-location`). Flaky when worktrees run
   in parallel.
4. **CI-red merge block (LAST)** — hook checks `gh pr checks <pr>` green before
   `gh pr merge`. Confirm scope with user before building.

## Landmine for next session
- The **main checkout is on another branch** (`fix/check-in-window-followups`,
  dirty — another track's work) and the user switches branches underneath the
  shared tree. ALWAYS `git rev-parse --abbrev-ref HEAD` inside the worktree
  before any commit; create worktrees off the `main` *ref* explicitly
  (`git worktree add -b <branch> .worktrees/<slug> main`), never assume the main
  checkout is on main.
