# Points engine — follow-ups & deploy checklist (2026-06-24)

Context for the member-points race fix (#100) and the write-amplification guard (#103).

## CI gate (this PR)

First GitHub Actions workflow (`.github/workflows/ci.yml`), two required jobs:

- **`checks`** — `pnpm format`, `turbo run lint typecheck build`, unit tests
  (`turbo run test` filtered to `apps/*` + `packages/*`), `knip`, `audit --audit-level=high`,
  `test:seed`. No JVM.
- **`emulator`** — Java (temurin 21) + pinned `firebase-tools`, then the beacon
  emulator suite (`pnpm --filter beacon run test:emulator`) and the Firestore/Storage
  rules suites (`pnpm --filter "./tests/*" run test`). All emulator runs serialize via
  `tools/scripts/with-emulator-lock.sh`.

The `emulator` job is what keeps the points-race and write-skip regressions from silently
returning — it runs the guards that the unit fakes structurally cannot.

**Owner action:** make both jobs **required** under branch protection for `main`
(Settings → Branches). The workflow runs but is not enforced until that's set.

## Deploy checklist — composite index (prod)

`recomputeAggregate` queries `participations` by `(memberId, termId, state)`. That composite
index is declared in `firestore.indexes.json` and must be **Enabled** in prod, or the query
throws in production (the emulator auto-creates indexes and hides this).

**Owner action:** run `pnpm deploy:indexes` (new script; `firebase deploy --only
firestore:indexes`) — or confirm in the Firebase console that the participations
`(memberId, termId, state)` index shows **Enabled** — before relying on the points fix in prod.

## Deliberately deferred (tracked, not lost)

- **Intra-term participations-query cap.** No `.limit()` on the recompute query. A naïve
  `.limit()` would *silently undercount* a high-volume member, so it is intentionally absent;
  the real fix is the deferred **term-window cutoff in the aggregate** (already in
  `apps/beacon/CLAUDE.md` Deferred). Realistic member volumes are far below any transaction
  read limit.
- **`slowReadsDb` / `countWritesTo` test proxies** in `recompute-race.emulator.test.ts` key on
  firebase-admin method names (`where`/`get`/`set`/`runTransaction`). Revisit on a
  firebase-admin major bump — a renamed surface would break the proxies silently (the
  end-to-end test alongside them still catches gross breakage).
