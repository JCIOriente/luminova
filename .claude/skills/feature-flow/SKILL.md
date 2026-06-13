---
name: feature-flow
description: >-
  Drive a feature from a clean worktree to an open PR with a handoff. Use when
  the user says "ship a feature", "start feature work in a worktree", "run the
  full feature flow", "build X end-to-end and open a PR", or asks to take a
  change through the whole sequence (worktree → design → review → PR → handoff).
  Orchestrates the existing skills/subagents in order; it does not reimplement
  them. Do NOT use for a one-line fix, a pure question, or work already in
  progress on an existing branch. Bypass the ceremony when the user says "auto",
  "go", or "just do it" — but still never commit on main.
---

# feature-flow

The end-to-end ship sequence for this repo. One invokable checklist so a feature
goes worktree → (design) → implement → clean → review → PR → resume → handoff
without skipping steps. Each phase delegates to a real skill or subagent — this
skill is the conductor, not the orchestra.

Create a TodoWrite item per phase before you start.

## Phase 1 — Worktree first (BEFORE any edit)

Branches are shared across worktrees in this repo; the wrong-branch commit is a
real, recurring bug. The `branch-guard.sh` hook hard-blocks commits on
`main`/`master`, but that is the backstop. The fix is structural: never edit
until an isolated branch is checked out.

1. Confirm clean state on `main`: `git status --porcelain` empty, `git rev-parse --abbrev-ref HEAD` = `main`.
2. Pick a scoped branch name: `feat/<slug>` (or `fix/`, `chore/`, `migration/`).
3. Create + check out an isolated worktree — prefer a native tool, fall back to git:
   - Native: `EnterWorktree` / `WorktreeCreate` / `/worktree` if available.
   - Fallback (repo convention): `git worktree add -b feat/<slug> .worktrees/<slug> main`
     (`.worktrees/` is gitignored; `node_modules` is symlinked via `.claude/settings.json`).
4. **Verify before touching code:** `git -C .worktrees/<slug> rev-parse --abbrev-ref HEAD` must equal your branch. All subsequent Write/Edit paths go inside `.worktrees/<slug>/`.

### Red flags — stop if you catch yourself thinking…

| Thought | Reality |
|---|---|
| "I'll just make this one edit first, then branch." | No. Worktree before the first byte. The mixing bug starts here. |
| "I'm probably still on the feature branch." | Probably ≠ verified. Run `git rev-parse --abbrev-ref HEAD`. |
| "The hook will catch a bad commit." | The hook is the backstop, not the plan. Don't lean on it. |

## Phase 2 — Design (UI work only; skip for pure logic)

Only when the change has a meaningful UI surface (a new page, component, or flow
in `spotlight`/`backstage`/`packages/ui`). Skip entirely for logic, functions,
or rules work.

- `frontend-design` **first** — aesthetic vision, layout, palette direction.
- `ui-ux-pro-max` **second** — validate palette, typography, a11y, contrast.
- Order matters: vision before validation, or you get design-by-committee.

### Subagent model tiering (every dispatch)

When you fan work out to subagents, the **main agent chooses `model` explicitly
on every `Agent` call** — never leave it implicit:

| Model | Use for |
|---|---|
| `fable` | Mechanical / format / rename passes, narrow lookups. |
| `sonnet` | Routine implementation, search, scaffolding, straightforward tests. |
| `opus` | Security, `firestore.rules`, Cloud Functions, cross-boundary contracts, ambiguous design, anything where a wrong call is expensive. |

Default to the cheapest tier that fits; escalate deliberately, not reflexively.

## Phase 3 — Implement → clean → review

1. Implement (TDD where it applies — `superpowers:test-driven-development`).
2. `/simplify` on the diff — reuse, dead code, redundant vars. (Only once the feature is functionally done, not mid-iteration.)
3. `/code-review` on the diff — correctness + reuse. It has caught CRITICALs the subagents missed; do not skip it.
4. `/security-review` — **required** when the diff touches auth, `firestore.rules`, or `apps/beacon`. Dispatch the matching read-only subagent too: `firestore-security-reviewer` (rules/repositories/auth routes), `firebase-functions-reviewer` (beacon), `bundle-budget-watcher` (frontend deps/routes).
   - **Stamp the review.** Once `/security-review` comes back clean, record the reviewed sha so `security-review-gate.sh` lets the PR through:
     ```
     git commit --allow-empty -m 'chore: security-review' -m "Security-Reviewed: $(git rev-parse HEAD)"
     ```
     (or add the `Security-Reviewed: <HEAD-sha>` trailer to the next real commit). The gate honors it only while no sensitive file changes after that sha — re-review and re-stamp if you touch a sensitive path again.

Checkpoint-commit per milestone; never batch >10 modified files.

## Phase 4 — PR

- `gh pr create` — never the web UI. Body uses the repo template:
  ```
  ## Summary
  - <what changed>
  - <why>

  ## Test plan
  - [ ] <stack>-ci pass
  - [ ] /security-review run (if triggers match)
  ```
- Run `pnpm pr-tests` locally right after opening.
- Conventional Commit with module scope (`feat(backstage): …`).

## Phase 5 — Resume

Emit a concise summary back to the user:
- **What** shipped (bullets), **why**, and the **verification evidence** (test
  counts, review outcomes, commands run + their results). Evidence before
  assertions — no "should work".

## Phase 6 — Handoff

1. Write `docs/status/YYYY-MM-DD-<slug>.md` in the repo format: **Shipped /
   Verification / Decisions / Deferred**.
2. Produce a copy-pasteable **handoff prompt** for the next session: current
   branch + worktree path, what's done, what's open, the next concrete step, and
   any landmines (e.g. "re-verify the branch before committing").

## Out of scope

- One-line fixes, typo edits, pure questions — too much ceremony.
- Reimplementing `frontend-design`, `/code-review`, etc. — this skill calls them.
