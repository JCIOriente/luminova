# 2026-10-25 — Profile discovery (R25)

Branch `fix/brand-profile-discovery`, PR #270. Spec `docs/specs/2026-10-25-profile-discovery.md`.

## Shipped

- `luminova.json` and `brand/luminova.schema.json` removed. `brand/` selects the profile:
  its one chapter profile, else the example `jci-oriente`; two stop every command (P1–P3).
- `brand:init` refuses a second chapter profile before the first question (P8).
- `brand:doctor`: a **selection** row; a warning for a leftover `luminova.json` and for a
  differing `BRAND_PROFILE`; only a warning for two chapter profiles under `--profile`.
- `deploy-ready.sh` applies the rule in bash (working tree or git ref), listing folders as
  Node does; a test pins its example and fixture names to the TypeScript constants.
  Deploy's filter drops `luminova.json` (P7).
- Upstream CI fails when `brand/` holds a chapter profile (P9).
- Docs: adopting guide, setup docs, READMEs, CLAUDE.md; C1, C5, C7, C8 and D18 point at
  the new spec. Roadmap R25, R26.

## Verification

- `pnpm pr-tests` exit 0 (turbo `ci` 17/17, knip, seed, harness, ci-scripts, dotenv guard,
  audit at high).
- `packages/brand` vitest 342/342; `deploy-ready.test.mjs` 11/11; `seed-target.test.mjs` 11/11.
- Real path: `brand:init --local` for `jci-urkupina` became the selection in doctor and in
  `deploy-ready.sh`; a second init and two folders stopped with the same list.
- Mutation checks bit: the fixture rename, the old dot-glob, the upstream guard.

## Decisions

- The example is the `EXAMPLE_PROFILE` constant, not an `"example": true` flag in
  `brand.json` (P2): the code already names it, and a second marker could disagree.
- `/code-review` was replaced by adversarial Opus passes (full branch, then the fix delta),
  as the PR body says.

## Deferred

- R26 `brand:setup` (tool install and sign-in checks, "Before you start" in the adopting
  guide): next session, stacked on this branch or off `main` after #270 merges (it reuses
  `doctor.ts`, which this PR changed).
