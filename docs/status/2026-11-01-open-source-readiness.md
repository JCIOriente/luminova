# Open-source readiness

## Shipped

- **#290, brand CLI clarity:** status reports as plain-language tables with a verdict first;
  false alarms removed; every printed `gh` hint names the repository.
- **#291, adopter readiness:** no single chapter's identity where an adopter reads it, and
  operations docs that work for any chapter. JCI stays: it is the product's identity.
- **This PR, hardening:** CD's sign-in pins the repository id, and a Vitest teardown race no
  longer fails CI.

## Verification

- `pnpm pr-tests` exits 0 on #290 and #291; CI is green on both.
- The `repository_id` condition has not run against a real provider. Its first test is the
  owner step below.
- The teardown race was forced in 6 of 6 runs before the filter and 0 of 6 after; a real
  unhandled rejection still fails the run.
- The three branches merge without conflicts.

## Decisions

- The `position-table` flake was never that test: Vitest blames whichever file is closing.
- Backstage's `db` chunk is 37.0 kB gz, under the 40 kB budget. The report that it was over
  came from `docs/performance.md`, which predated the move to the lite SDK.
- The `runs overlapped` failure on `main` (2026-11-01) predates the Ubuntu 26.04 lock fix.
- The two `brand:guard` races stay: they are too rare to justify more locking.
- `jci-*` tokens and the README's origin story stay.

## Deferred

- **Owner, before relying on the id pin:** run the owner step in `docs/ci-cd.md` section 6 for
  the live provider, then confirm with one deploy. Until then production keeps the older
  condition, which is safe but name-based.
- **Owner:** get JCI's written position on the design language; the license cannot limit
  adoption to JCI chapters, only the marks can.
- `docs/negocio/` was not reviewed for public suitability beyond a search for contact details
  and amounts.
- Spotlight and `packages/ui` also run Vitest on jsdom without the teardown filter. Extract a
  shared helper if the race appears there.
