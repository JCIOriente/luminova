# Handoff — pr-tests emulator port race (PR #74)

**Date:** 2026-06-18
**Branch:** `fix/pr-tests-port-race` → PR #74 (base `main`)
**Worktree:** `.worktrees/pr-tests-port-race`

Backlog **item 3**. Items 1, 1.5(gate-worktree), 2 are done (#68 merged; #70
merged; #72 open).

## Shipped

- **`tools/scripts/with-emulator-lock.sh`** (new) — portable machine-wide `mkdir`
  lock that serializes `firebase emulators:exec` runs. Wraps the `test` script of
  both `tests/firestore-rules` and `tests/storage-rules`; each `ci` now calls
  `test` (collapsed the prior duplication).
- **Root cause:** `turbo run ci` runs every package `ci` concurrently → both
  rules suites bound the firestore emulator + Emulator Hub on the same fixed
  ports from the single root `firebase.json` → flaky collision. Parallel
  worktrees collided too. A lock removes the race without per-suite port juggling.
- **`tools/scripts/lib/with-emulator-lock.test.mjs`** (new) — 5 `node:test` cases,
  run by `pnpm test:seed`.

## Verification

- 5 lock tests green: serialize, **concurrent-reclaim serialize** (the critical
  fix), stale-PID reclaim, timeout, no-args.
- Both rules suites concurrently via turbo serialize cleanly: firestore-rules 141
  → shutdown → storage-rules 34. 2/2 successful.
- `pnpm pr-tests` green through **format → turbo ci → knip → test:seed**. The
  `pnpm audit --audit-level=high` step fails on **pre-existing transitive CVEs**
  only (`esbuild` moderate + `form-data` high via `firebase-admin`/vite) — zero
  deps added here. See "audit gate" below.
- `/code-review` (opus) found 3 real concurrency bugs in the first naive version;
  all fixed + re-tested (serialized reclaim, trap-before-pid + INT/TERM, no-args,
  exit passthrough).

## Audit gate — standing item (not item 3)

`pnpm pr-tests` ends with `pnpm audit --audit-level=high`, which now fails on two
HIGH-or-below transitive advisories that no PR here introduced:
- `esbuild <0.28.1` (moderate) — already overridden in `pnpm-workspace.yaml`, but
  audit still reports a moderate path.
- `form-data <2.5.6` (HIGH, CRLF injection) via `firebase-admin > @google-cloud/*
  > retry-request > @types/request > form-data` (6 paths).

Because the audit step is part of `pr-tests`, it red-flags EVERY PR regardless of
scope. This needs a dedicated **secure-dep-vetting / dependabot** pass (bump or
override `form-data`; re-check `esbuild`), tracked separately from the harness
backlog. Until then, `pr-tests` "fails" on audit even when the change is clean.

## Backlog remaining (CI-red is item 4, LAST)
- **Standing:** stand up CI (No CI yet — user confirmed). The repo merges over red
  `main` undetected; this is the systemic gap. Item 4 (red-merge block) is moot
  until checks exist.
- **Standing:** the audit-gate dependency advisories above (secure-dep-vetting).
- 4. **CI-red merge block (LAST)** — hook checks `gh pr checks <pr>` green before
  `gh pr merge`. Confirm scope with user; presupposes CI exists.

## Open PRs (left for user review)
- #72 — gate-worktree-cwd fix.
- #74 — this (pr-tests port race).

## Landmine
- Shared working tree: the **main checkout drifts onto other branches**; local
  `main` ref lagged `origin/main` by 12 commits this session. Always base
  worktrees off `origin/main` and verify the branch inside the worktree before
  committing.
