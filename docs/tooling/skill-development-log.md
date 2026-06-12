# Skill & Harness Development Log

Chronological record of changes to this repo's Claude Code harness — skills,
hooks, subagents. Newest first. Referenced from `CLAUDE.md` (Docs layout).

## 2026-06-12 — `feature-flow` skill + `branch-guard` hook

**Branch:** `chore/feature-flow-workflow`

### `branch-guard.sh` (`.claude/hooks/`)
- **What:** new `PreToolUse(Bash)` hook, wired first in the Bash matcher before
  `pre-commit.sh`. Hard-blocks (exit 2) `git commit` on `main`/`master` —
  unconditionally, ignoring `--no-verify`. Warns (non-blocking) on branch names
  outside `feat/|fix/|chore/|migration/`.
- **Why:** the working tree is shared across worktrees; branches change
  underneath the agent and feature work landed on the wrong branch. Plan docs
  papered over it with a manual "check the branch before committing" reminder —
  easy to skip. This makes the dangerous case a hard stop.
- **Reuses:** the stdin-JSON parse idiom + `git commit` filter from
  `pre-commit.sh`; the exit-2 block convention.

### `feature-flow` skill (`.claude/skills/feature-flow/`)
- **What:** an invokable, six-phase conductor: worktree-first → design (UI only)
  → implement/clean/review → PR → resume → handoff. Mandates worktree creation
  and branch verification *before any edit*, and explicit subagent model tiering
  (`fable`/`sonnet`/`opus` per dispatch).
- **Why:** the CLAUDE.md "Full workflow" was a long reference, not an actionable
  checklist; the worktree-first discipline and model tiering were tribal
  knowledge ([[feedback-subagent-model-tiering]]). This codifies them.
- **Orchestrates, not reimplements:** delegates to `frontend-design`,
  `ui-ux-pro-max`, `/simplify`, `/code-review`, `/security-review`, and the
  read-only `-reviewer` subagents.
- **Wiring:** added to the CLAUDE.md single-purpose skill catalog + a pointer in
  the Full workflow section; `branch-guard.sh` added to the Hooks table.

### Verification
- branch-guard: 4 cases exercised — block on `main` (exit 2), allow on `chore/`
  (exit 0 silent), pass-through on non-commit command (exit 0), warn on a
  non-conforming branch name (exit 0 + stderr). All green.
- `settings.json` valid JSON; hook order confirmed `branch-guard.sh -> pre-commit.sh`.
- `SKILL.md` frontmatter parses (`name: feature-flow`).
