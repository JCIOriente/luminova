# Brand config — spec and plan (PR 0)

## Shipped

- `docs/specs/2026-10-22-brand-config-design.md`: build-time brand profiles. Images live in the
  gitignored `brand-assets/` folder with fixed generic names; deploy assets sit in a private Cloud
  Storage bucket that CD pulls. JCI Oriente is the committed placeholder profile. Release builds
  fail loudly on a missing asset, a missing config value or a profile/project mismatch.
- `docs/plans/2026-10-22-brand-config.md`: PRs 1a, 1b, 2a, 2b and 3, with TDD tasks, checkpoint
  commits, unverified assumptions and owner steps B0–B6.
- `docs/roadmap.md`: Q4 resolved (proceed), rows R16–R20, owner ops O9 and O10.

## Verification

- Opus wrote the spec and plan; a Fable design review returned "approve with changes", and its
  findings H1–H4, M1–M7 and L1–L9 were applied.
- `prettier --check` passes on the three docs. The diff adds no `§`, and no reference to the old
  spec path remains.
- Review router verdict: lighter (docs only). `Review-Exception` is in the PR body.

## Decisions

- Assets out of git for deployments; the owner accepted keeping JCI Oriente's assets committed as
  the dev placeholder, so the `NOTICE` carve-out remains.
- Chapter prose ("18 organizaciones en Bolivia", "Santa Cruz", "Cámara Junior Internacional")
  becomes profile configuration, not i18n.
- `seed:production` requires an explicit project and refuses one that differs from the profile's
  `firebase.projectId`.
- The profile is selected only by `BRAND_PROFILE`, so turbo's task hash always covers it.

## Deferred

- i18n string extraction and the `chapters.json` adopter registry (spec follow-ups).
- Each unverified assumption in the plan is settled by its named task or owner step.
