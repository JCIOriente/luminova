# Handoff — security-review hard gate (PR #68)

**Date:** 2026-06-13
**Branch:** `feat/security-review-gate` → PR #68 (base `main`)
**Worktree:** `.worktrees/security-review-gate`

This is **item 1 of 4** in the harness-hardening backlog (the security-review
hard gate). Items 2–4 remain — see Deferred.

## Shipped

- **`.claude/hooks/security-review-gate.sh`** — new `PreToolUse(Bash)` hook,
  wired last in the Bash matcher in `.claude/settings.json`. On `gh pr create`,
  if the branch diff (vs the `origin/HEAD`-resolved default branch) touches the
  `SENSITIVE` path set (`apps/beacon/`, `firestore.rules`, `_auth`, `_app.tsx`,
  `repositories/`, `/functions/`), it **blocks** (exit 2) unless a fresh
  `Security-Reviewed: <sha>` commit trailer is in range. Freshness = the sha is
  a HEAD-ancestor **and** no sensitive file changed after it.
- **Producer:** `feature-flow` phase 3 now stamps the trailer once
  `/security-review` is clean; the manual stamp command is also in the CLAUDE.md
  hooks table for non-feature-flow PRs.
- **`post-pr-create.sh`** — added a cross-reference comment so the duplicated
  `SENSITIVE` path set stays in sync with the gate.
- Docs: CLAUDE.md hooks table row, `docs/tooling/skill-development-log.md` entry.

## Decisions (settled with user before coding)

- Marker = **commit trailer + freshness**, chosen over a docs-status artifact or
  a diff-hash sentinel file.
- Gate fires on **`gh pr create` only** (not `git push`).

## Verification

- **10-scenario hook test suite, all green** (throwaway repo): block-no-trailer;
  fresh-trailer-pass; sensitive-after-trailer-block; non-sensitive-pass;
  non-ancestor-sha-block; quoted-string-noop; chained-`&&`; `;`-suffix;
  subshell `(…)`; symbolic-ref-trailer-reject.
- `/simplify` (4 angles): logic clean; applied heredoc→herestring + SENSITIVE
  cross-ref. Shared-lib extraction rejected (over-engineering for two tiny hooks).
- `/code-review` (opus): caught + fixed **two false-allows** —
  (1) separator-suffixed `gh pr create;`/`(gh pr create)` evaded the
  command-position filter; (2) symbolic-ref trailer `Security-Reviewed: HEAD`
  self-certified. Both fixed (trailing-boundary widened to `[;&|)]`; trailer
  value constrained to a literal `[0-9a-f]{7,40}` sha). Producer/consumer
  trailer format verified to parse end-to-end (the `-m`-as-second-arg trailer
  is recognized by `%(trailers:key=…)`).
- `pnpm pr-tests`: green — 297 backstage tests, 13/13 turbo tasks, 5 tools tests.
  The lone `1 moderate` audit advisory is the pre-existing transitive esbuild
  CVE (GHSA-gv7w-rqvm-qjhr), unrelated to this change (zero deps touched).

## Deferred / known

- **`security-review-gate.sh` fails OPEN** when `node` is missing or the
  merge-base is undeterminable — consistent with `branch-guard.sh`/`pre-commit.sh`
  (Node 24 is a hard repo requirement; "don't false-block" is intentional). If a
  fail-closed posture is wanted for the security gate specifically, that's a
  follow-up.
- **Auth-path coverage hole:** the `SENSITIVE` set matches `_auth`/`_app.tsx`
  (TanStack route folders) but not plain modules like `auth.ts`/`useAuth.ts`.
  This is the *pre-existing* definition shared with `post-pr-create.sh`;
  broadening it (risk: `oauth`/`author` false matches) is its own scoped change.
- **`post-pr-create.sh` lacks the command-position regex** the other two hooks
  have, so it false-positives its reminder on commits whose message merely
  contains the string `gh pr create`. Benign (non-blocking reminder); tiny
  consistency follow-up.

### Backlog remaining (in order; CI-red LAST per user)
2. **CREATE-rule audit** — bake "audit CREATE paths with equal rigor to UPDATE"
   into the `firestore-security-reviewer` subagent checklist (`.claude/agents/`).
   No runtime code.
3. **pr-tests port race** — turbo `ci` rules-emulator port non-serialized;
   pin/lock per run (see `feedback-pnpm-overrides-location`).
4. **CI-red merge block (LAST)** — hook checks `gh pr checks <pr>` green before
   `gh pr merge`. Confirm scope with user before building.
