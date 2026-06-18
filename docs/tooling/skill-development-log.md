# Skill & Harness Development Log

Chronological record of changes to this repo's Claude Code harness — skills,
hooks, subagents. Newest first. Referenced from `CLAUDE.md` (Docs layout).

## 2026-06-16 — `security-review-gate.sh`: diff the worktree, not the main checkout

**Branch:** `fix/gate-worktree-cwd`

### `.claude/hooks/security-review-gate.sh`
- **What:** the gate now `cd`s to the PreToolUse payload's `.cwd` (falling back to
  `CLAUDE_PROJECT_DIR`, then `.`) before resolving the diff range, instead of
  always using `CLAUDE_PROJECT_DIR`.
- **Why (real gap):** `CLAUDE_PROJECT_DIR` is the main checkout, which stays on
  `main`. For a **worktree-based PR** — the workflow `feature-flow` mandates —
  the gate was diffing `main...main` = empty → it never fired. The `.cwd` field
  tracks the actual working directory including worktrees (confirmed against the
  official hooks docs), so diffing there inspects the PR's own branch. Found
  while shipping the CREATE-audit PR (#70) through a worktree.
- **Verification:** new 4-case cwd suite — (C1) `.cwd`=worktree-sensitive +
  `CLAUDE_PROJECT_DIR`=clean-main → BLOCK (proves cwd is used); (C2) `.cwd`=clean
  vs env=sensitive → PASS (cwd wins); (C3) no `.cwd` → fallback to env BLOCK;
  (C4) bad `.cwd` → fallback BLOCK. Plus the original 10-scenario suite green
  (back-compat). `cd` target is double-quoted (no injection from the path value).

## 2026-06-13 — `firestore-security-reviewer`: CREATE-path parity check

**Branch:** `chore/reviewer-create-audit`

### `.claude/agents/firestore-security-reviewer.md`
- **What:** added checklist item #3 "CREATE-path parity" — audit `create` rules
  with the same rigor as `update`, specifically that power/identity fields
  (roles, claims, `assignedBy`, `uid`, cargo grants) cannot be forged on create
  (no client-set `uid`, self-stamped attribution, non-privileged actors limited
  to empty grants). Critical if violated. Renumbered the trailing items 4–9.
- **Why:** create paths lag update and are the easy miss. In K4, a Membership
  user created a member with a client-set `uid` + forged
  `assignedBy=<known-Admin>` + a power cargo → the claims trigger minted Admin —
  a Critical caught only by `/code-review`, not the reviewers. Encoding it in the
  subagent's checklist closes that gap. See the `feedback-audit-create-rules`
  memory.
- **Scope:** checklist text only; no runtime code, no rules change.

## 2026-06-13 — `security-review-gate` hook (hard gate)

**Branch:** `feat/security-review-gate`

### `security-review-gate.sh` (`.claude/hooks/`)
- **What:** new `PreToolUse(Bash)` hook on `gh pr create`, wired last in the Bash
  matcher. Hard-blocks (exit 2) the PR when the branch diff (vs the default
  branch resolved from `origin/HEAD`) touches `apps/beacon`/`firestore.rules`/
  `_auth`/`_app.tsx`/`repositories/`/`/functions/` **unless** a fresh
  `Security-Reviewed: <sha>` commit trailer exists in range.
- **Freshness rule:** the trailer's sha must be an ancestor of `HEAD` AND no
  sensitive file may have changed after it. A stale or foreign sha is rejected.
- **Why:** `post-pr-create.sh` only *reminded* to run `/security-review`; the
  reminder is skippable. This enforces it for the paths that matter. Decisions
  (with user): commit-trailer + freshness over a docs artifact or diff-hash
  sentinel; fire on `gh pr create` only (not `git push`).
- **Producer:** `feature-flow` phase 3 stamps the trailer once `/security-review`
  comes back clean.
- **Reuses:** the stdin-JSON parse + command-position regex idiom from
  `branch-guard.sh`; the default-branch resolution from `post-pr-create.sh`.

### Verification
- 7 scenarios in a throwaway repo: (1) sensitive + no trailer → block;
  (2) fresh trailer at HEAD → pass; (3) sensitive change after trailer → block;
  (4) non-sensitive branch → pass; (5) trailer sha not a HEAD-ancestor → block;
  (6) quoted `"gh pr create"` (not command position) → pass; (7) chained
  `&& gh pr create` on a sensitive branch → block. All green.
- `settings.json` valid JSON; gate wired after `pre-commit.sh` in PreToolUse.

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
