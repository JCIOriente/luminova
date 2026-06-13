# Harness — branch-guard hook + feature-flow skill (status)

_Date: 2026-06-12 · Branch: `chore/feature-flow-workflow` · Worktree: `.worktrees/feature-flow` · PR: [#65](https://github.com/JCIOriente/luminova/pull/65)_

## Shipped
- **`.claude/hooks/branch-guard.sh`** — `PreToolUse(Bash)` hook, wired first in the Bash matcher (`.claude/settings.json`). Hard-blocks (exit 2) `git commit` on `main`/`master`, unconditionally (ignores `--no-verify`). Warns (exit 0) on branch names outside `feat/|fix/|chore/|migration/`. Cheap raw-string fast-path before the node JSON parse (hook fires on every Bash call); command-position regex on the parsed command so it won't false-fire on `echo "git commit"` / `grep "git commit"`.
- **`.claude/skills/feature-flow/SKILL.md`** — invokable 6-phase ship conductor: worktree-first (verify branch before any edit) → design (UI only: frontend-design → ui-ux-pro-max) → implement/clean/review (`/simplify` → `/code-review` → `/security-review`) → PR → resume → handoff. Mandates explicit subagent model tiering (`fable`/`sonnet`/`opus`).
- **`CLAUDE.md`** — skill-catalog row, Full-workflow pointer, hooks-table row for `branch-guard.sh`.
- **`docs/tooling/skill-development-log.md`** — created (was referenced in CLAUDE.md, previously missing); logged this change.

## Verification
- branch-guard, exercised by direct execution: block on `main` (exit 2) · allow on `chore/` (exit 0) · pass-through on non-commit (exit 0) · warn on a real non-conforming branch · chained `git add && git commit` still blocks · **no** false block on `echo "git commit"` / `grep "git commit"` while on `main`. All green.
- `settings.json` valid JSON; hook order confirmed `branch-guard.sh -> pre-commit.sh`.
- `SKILL.md` frontmatter parses (`name: feature-flow`).
- `/simplify` (4-angle) + `/code-review` (high effort) run on the diff; applied the two material findings (efficiency fast-path; false-positive-block regex). Skips documented inline in the conversation.
- `pnpm pr-tests`: **282 backstage tests + 5 script tests pass**, 13/13 turbo tasks successful.
- `/security-review`: N/A — diff touches no auth / `firestore.rules` / `apps/beacon`. (The `post-pr-create.sh` flag was a false positive; see Decisions.)

## Decisions / notes
- **Dogfooded:** this work was itself done via the feature-flow sequence — worktree created off `main` first, branch verified before any edit.
- **branch-guard match precision:** `/code-review` flagged that a loose `*"git commit"*` substring would *block* a harmless `echo "git commit"` on `main`. Fixed with a command-position regex `(^|[[:space:]]|[;&|(])git[[:space:]]+commit([[:space:]]|$)`. `pre-commit.sh` keeps the looser substring (it only runs lint, doesn't block) — not changed here to stay minimal.
- **node-missing bypass (skipped):** if `node` is absent the parse yields `""` and a `main` commit could slip. Left as-is — `pre-commit.sh` shares the exact exposure, node is mandatory in this repo, and a precise-regex raw-JSON fallback is incompatible with the quote-aware match. Acceptable, consistent with existing hooks.
- **DRY-vs-self-containment (skipped):** simplify/code-review suggested replacing the skill's model-tiering table / PR template / worktree path with pointers to CLAUDE.md. Kept inline on purpose — a skill must be actionable standalone when invoked; over-referencing defeats that.

## Deferred (designed-not-out)
- **`post-pr-create.sh` base-branch bug (real, found here):** the hook computes its diff against `origin/master`/`master`, but this repo's default is `main`. Merge-base fails → it falls back to `HEAD~1` and flagged unrelated files (initiatives/programs/projects repos, `firestore.rules`) as security-sensitive on PR #65 — a false positive. Fix: change the base to `origin/main`/`main` (or detect the default branch). This is the same class as the earlier harness-improvement list; queue as a follow-up `fix/` PR.
- Remaining items from the original 6-point harness list (CI-red merge block, security-review hard gate, CREATE-rule audit in subagent, pr-tests port race) — not in this PR's scope.
