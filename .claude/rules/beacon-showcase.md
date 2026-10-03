---
paths:
  - "apps/beacon/src/showcase/**"
  - "apps/beacon/src/index.ts"
---

# Beacon showcase projections — known gaps

The stale-publication residual (non-bool `active`) is in `apps/beacon/CLAUDE.md`.

- **boardShowcase term rollover + cargo edits:** `onBoardMemberWritten` fires only on `members/{id}`, so a member with no write after the UTC-year rollover keeps a prior-term public entry, and a cargo title/titleFemale/category edit in `positions/` does not re-project holders. Fix: scheduled re-projection at rollover and/or an `onDocumentWritten("positions/{id}")` trigger.
- **Showcase team-credit names go stale on a rename:** `showcasePerson` denormalizes `members/{id}.name` into `showcase/{initiativeId}.team[]`, but `projectShowcase` runs only from `initiativeTrigger` / `onActivityWritten`. Fix: rename-gated fan-out in the members trigger (skip unless `before.name != after.name`), querying programs+projects on `roster.directorId` / `roster.coDirectorIds` / `roster.teamIds` (nested paths — bare names match nothing), bounded with `.limit()`, re-projected through `chunk()`.
- **boardShowcase ordering (CLOSED):** `onBoardMemberWritten` projects inside a transaction that reads the LIVE member doc (event payload used only for the doc id), runs `retry: true` and rethrows — the delete branch is the takedown path. Never project from `after.data()`.
