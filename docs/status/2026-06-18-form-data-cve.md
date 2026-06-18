# Handoff — patch form-data CRLF-injection HIGH (PR #75)

**Date:** 2026-06-18
**Branch:** `fix/form-data-cve` → PR #75 (base `main`)
**Worktree:** `.worktrees/form-data-cve`

Clears the HIGH advisory that `pnpm audit --audit-level=high` (last step of
`pr-tests`) was raising on every PR.

## Shipped

- Two `pnpm-workspace.yaml` overrides patching **GHSA-hmw2-7cc7-3qxx** (form-data
  CRLF injection via unescaped multipart field/filenames):
  - `form-data@<2.5.6 → ^2.5.6` — the 2.x copy via `@types/request > retry-request`
    (under `firebase-admin`/`@google-cloud`). 2.5.6 = official v2-backport patch.
  - `form-data@>=4.0.0 <4.0.6 → ^4.0.6` — the 4.x copy via `wait-on > axios`
    (this one was the surprise; 4.0.5 was *also* vulnerable, not just the 2.x).

## Verification (secure-dep-vetting)

- Resolves to **form-data 2.5.6 + 4.0.6** — latest-secure in each major; not
  deprecated; engines `>=6` (Node 24 ok).
- `pnpm audit --audit-level=high` → **exit 0** (was exit 1). Remaining: 2 moderate
  (`uuid`, `protobufjs`) — below the high gate.
- `turbo run ci` 13/13 green (run `--concurrency=1`; see note). `pnpm format`,
  `pnpm knip` clean.

## Note — full parallel pr-tests needs #74

`pnpm pr-tests` runs `turbo run ci` at full concurrency, which on this branch
still hits the **pre-#74 emulator port race** (this branch is off `main`, which
lacks the `with-emulator-lock.sh` from PR #74). Verified green serialized
(`--concurrency=1`). Once **#74 merges**, the parallel `pr-tests` is clean on a
rebuilt tree. The form-data change itself is independent of #74.

## Open PRs (review queue)
- **#74** — pr-tests emulator port race (the lock). Merging this first makes
  everyone's `pr-tests` parallel-clean.
- **#75** — this (form-data HIGH).

After both merge, `pnpm pr-tests` should be **fully green end-to-end** for the
first time this track (lock fixes the race; form-data clears the audit HIGH).

## Backlog remaining
- Standing: **stand up CI** (No CI exists — user confirmed). Subsumes item 4.
- 4. **CI-red merge block (LAST)** — moot until CI checks exist.
- Moderates left in audit (`uuid`, `protobufjs`) — below the gate; address via
  Dependabot/secure-dep-vetting if desired, not blocking.
