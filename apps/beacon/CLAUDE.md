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
- **Heaviest skills.** `/security-review`, `secure-dep-vetting` (server deps).
