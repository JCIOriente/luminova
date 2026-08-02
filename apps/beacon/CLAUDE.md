# Beacon — Claude Code Guide

## Purpose

Firebase Cloud Functions backend. Owns the Recognition Engine compute: it turns
participation **facts** into the engine-only `participations` ledger and the
`memberPoints` aggregate. Also hosts the `setUserRoles` admin callable.

## Functions

### `awardPoints` — `onDocumentWritten('checkIns/{id}')`

The engine's entry point. A `checkIns/{id}` doc (`{ memberId, activityId, role,
checkInAt }`) is written by an authorized client (Admin/ProjectManager, or a
Scanner scoped to the activity). On write:

1. `validateCheckIn` — reject malformed input (no throw → no retry storm).
2. Read `activities/{activityId}` (category, parentType/parentId, startAt, termId)
   and `pointRules/{termId}__{code}` (fallback `DEFAULT_POINT_VALUES`).
3. `deriveParticipation` — resolve `pointRuleCode`, apply the punctuality factor,
   evaluate the two gates → `state`, set `monthBucket`/`computedPoints`.
4. Write `participations/{activityId__memberId__role}` (deterministic id →
   idempotent) and recompute `memberPoints/{memberId}` + mirror `members.totalPoints`.
5. `syncActivityCheckInFlag` — mirror `hasCheckIns` onto the activity (transactional
   `count()` recompute, unconditional write = conflict anchor) so firestore.rules can
   lock category/startAt/parentId/parentType once check-ins exist.

On a `checkIns` **delete**, the derived row is removed and the aggregate recomputed
(and the flag re-mirrored).

The trigger runs with `retry: true` — the only trigger that does. The flag mirror
only recomputes on checkIns writes, so an unretried transient failure would strand
the rules-side lock; the handler is idempotent under redelivery and step 1's
no-throw contract prevents malformed-input retry storms.

### `confirmOnProgramReport` / `confirmOnProjectReport` — `onDocumentWritten('programs|projects/{id}')`

When a program/project `finalReport` transitions null↔set, flip that initiative's
participation rows provisional↔confirmed (`where parentId == id`) and recompute the
affected members' aggregates.

### `setUserRoles` — `onCall` (F1, unchanged)

Admin-guarded custom-claim assignment.

## Architecture

- **Pure helpers** (`award-points/derive.ts`, `aggregate.ts`, `check-in.ts`,
  `participation-id.ts`) — framework-free, fully unit-tested; consume
  `@luminova/types/engine` (`resolvePointRuleCode`, `computePunctualityFactor`,
  `DEFAULT_POINT_VALUES`, types).
- **Orchestration** (`award-points/process.ts`) — written against the `EngineStore`
  port; unit-tested with an in-memory fake. No Firestore here.
- **Glue** (`award-points/firestore-store.ts` admin-SDK `EngineStore` impl +
  `index.ts` trigger bindings) — impure; exercised by the emulator e2e, not units.

## Rules

- **Admin SDK only** — never import `firebase/firestore` (client SDK). Use
  `firebase-admin`. The engine writes the client-read-only `participations` /
  `memberPoints` / `members.totalPoints` via the admin SDK (rules bypassed).
- **NodeNext modules** — relative imports use explicit `.js` extensions (e.g.
  `import { processCheckIn } from "./award-points/process.js"`). `@luminova/types`
  is consumed via the `/engine` pure subpath (raw-Node-ESM valid).
- **Idempotent** — deterministic participation ids + full-recompute aggregate are
  safe under at-least-once redelivery.
- Functions runtime: **Node 24** (`firebase.json` → `functions.runtime: "nodejs24"`,
  `engines.node: "24"`).

## Harness

- **CI gate.** `pnpm --filter beacon run ci` = eslint → tsc → vitest. Rolled into
  `pnpm pr-tests`. Use `run ci` — bare `pnpm ci` is pnpm's reinstall builtin.
- **Sensitive surface — server-side trust boundary. ALWAYS `/security-review` +
  `firebase-functions-reviewer` before "done".** Untrusted check-in input, points
  integrity, deletion handling.
- **Deferred:** dues→points voiding (J4), roster auto-expansion of director/team
  rows (role arrives on the check-in fact in v1), term-window cutoff in the
  aggregate, prod composite indexes + functions bundling for deploy.
- **Deferred (boardShowcase term rollover + cargo edits):** `onBoardMemberWritten`
  derives the term from `currentTermKey()` at trigger time and resolves the cargo
  title/category from `positions/{cargoId}` at member-write time, but only fires on
  `members/{id}`. So (a) a board member whose doc gets no write after the UTC-year
  rollover keeps their prior-term entry live, and (b) an edit to a cargo's
  title/titleFemale/category in `positions/` does not re-project members holding it
  until each member doc is re-written. Same class as the aggregate term-window gap,
  but the stale data is public. Fix later with a scheduled re-projection at term
  rollover and/or an `onDocumentWritten("positions/{id}")` re-projection.
- **Deferred (showcase team-credit names go stale on a rename):** `showcasePerson`
  denormalizes `members/{id}.name` into `showcase/{initiativeId}.team[]`, but
  `projectShowcase` runs only from `initiativeTrigger` / `onActivityWritten` — never on a
  `members/{id}` write. So a rename leaves the old name in past team credits until that
  initiative is next edited, while `boardShowcase` (member-write-driven) updates
  immediately — the two public surfaces disagree in the meantime. Self-service renaming
  (`/me`) widened who can cause this; previously only admins renamed. Fix later with a
  rename-gated fan-out in the members trigger: skip unless `before.name != after.name`,
  then query programs+projects on `roster.directorId` / `roster.coDirectorIds` /
  `roster.teamIds` (nested paths — the bare names match nothing), bounded with `.limit()`
  and re-projected through `chunk()`.
- **boardShowcase ordering (CLOSED):** `onBoardMemberWritten` used to project
  `after.data()`, so a late-delivered invocation could re-publish a member from a stale
  payload — silently undoing an opt-out or an Admin takedown until the next member write.
  It now runs the whole projection inside a transaction that reads the LIVE member doc and
  uses the event payload only for the doc id, so the last committed state wins and a
  concurrent member write aborts and re-runs the projection. It also runs `retry: true`
  and rethrows, because the delete branch is the takedown path.
- **Heaviest skills.** `/security-review`, `secure-dep-vetting` (server deps).
