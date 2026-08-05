# Beacon — Claude Code Guide

## Purpose

Firebase Cloud Functions backend. Owns the Recognition Engine compute: it turns
participation **facts** into the engine-only `participations` ledger and the
`memberPoints` aggregate. Also hosts the `setUserRoles` admin callable.

## Functions

### `awardPoints` — `onDocumentWritten('checkIns/{id}')`

The engine's entry point. A `checkIns/{id}` doc (`{ memberId, activityId, role,
checkInAt }`) is written by an authorized client — any `checkIn:Attendance` holder
(Admin/ProjectManager/ActivityManager, or a custom role); a Scanner among them is
confined to `Attendee` rows by a rules conjunct, with no event scoping. On write:

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

The trigger runs with `retry: true` — one of three that do (`onMemberCreated` and
`onBoardMemberWritten` are the others; each states its justification at the call
site). The flag mirror
only recomputes on checkIns writes, so an unretried transient failure would strand
the rules-side lock; the handler is idempotent under redelivery and step 1's
no-throw contract prevents malformed-input retry storms.

### `confirmOnProgramReport` / `confirmOnProjectReport` — `onDocumentWritten('programs|projects/{id}')`

When a program/project `finalReport` transitions null↔set, flip that initiative's
participation rows provisional↔confirmed (`where parentId == id`) and recompute the
affected members' aggregates.

### `setUserRoles` — `onCall` (F1, unchanged)

Admin-guarded custom-claim assignment.

### `reseedBuiltInRolePerms` — `onCall`

Admin-guarded. Moves the LIVE `roles/{id}` docs onto the current `BUILT_IN_ROLE_PERMS`
snapshot. `seedRoles` uses `create()` and swallows `ALREADY_EXISTS` by design, so editing
the snapshot alone never reaches production — this is the path that does.

**OPERATOR SEQUENCE — both callables, in this order.** This one is **update-only**: it
never creates a missing doc. A newly added built-in role (`ActivityManager`, `Secretary`)
has no `roles/{id}` doc in production, so a reseed alone will never bring it into
existence — it comes back as `skipped` reason `missing` (and in `failed`), and the role
stays a "sin sincronizar" row on `/permisos` forever. Run:

1. `seedRoles` — create-only; brings the new role docs into existence with their seed
   perms, name and description. Leaves every existing doc untouched.
2. `reseedBuiltInRolePerms` — update-only; moves the existing docs onto the new snapshot.
3. `recomputeAllClaims` — the observable backstop (see BLAST RADIUS below).

Skipping step 1 is the failure mode to watch for; skipping step 2 leaves every incumbent
role on its old perms.

**OWNER-OP, after the reseed — the Secretario cargo, in this order.** The reseed strips the
Ally trio (`read:Ally`, `create:Ally`, `update:Ally`) from `Membership`; `Secretary` is where
those live now. But the code-side cargo mapping (`packages/types/src/cel-positions.ts`,
`tools/scripts/lib/cel-seed.mjs`) reaches a **fresh project only** — `seedPresident` writes
`CEL_SEED` just `if (snap.empty)`, and production `positions` is not empty. So in production
this is a `/positions` edit someone types by hand (Admin-only; the reseed never touches
`positions`):

4. **ADD `Secretary` to the Secretario cargo's `grants`.**
5. **THEN remove `Admin`** from that cargo.

Doing 5 before 4, or skipping 4, leaves `create:Ally`/`update:Ally` and
`manage:Lead`/`manage:Notification` with no holder but Admin — `/allies` and `/leads`
disappear from the nav of everyone whose authority came through that cargo, silently.

- Writes **`permissions` only.** Never `name`, never `description`: the doc owns display
  text, which is what lets a reseed coexist with role renaming. An operator re-running it
  must not silently revert every rename.
- Requires `confirm: "overwrite-builtin-roles"`. `requireAdmin` is the same gate the
  read-only admin ops use; a destructive one should not be one click away.
- `dryRun: true` writes nothing and returns per-doc `{id, current, proposed}`.
- Skips `locked === true`. The admin SDK bypasses the `locked` rule the client is held to,
  so `roles/Admin` is excluded explicitly rather than by assumption.
- One `WriteBatch` (≤ 9 docs, far under the 500 limit). The doc-by-doc loop would leave half
  the role set on new perms and half on old, with fan-outs already fired for the first half
  and no rollback.
- Returns `{ok, dryRun, applied: [{id, changedFields}], skipped, failed}`. `skipped` reasons
  are `locked` / `unchanged` / `not-built-in` / `missing`; `failed` is the operator
  shorthand for exactly the `missing` ids — run `seedRoles` first. **`ok` is false whenever
  `failed` is non-empty**, so the skipped-step-1 mistake does not read as success.

**BLAST RADIUS — cost.** `onRoleWritten` scans the **entire** members collection for any doc
carrying a `builtInKey`, unbounded (no `.limit()`, no cursor). Every applied doc fires its
own scan, and one `WriteBatch` lands them all at once — so the nine-role rollout is up to
eight *concurrent* full scans, each doing a sequential `getUser` plus possible
`setCustomUserClaims` per member, inside a 540 s budget with `retry: false`. A timeout
strands the members that scan had not yet reached. **Operator instruction: run
`recomputeAllClaims` afterwards as the observable backstop** — noting it is itself an
unbounded scan, so on a large collection the backstop shares the failure mode. Re-running
the reseed is free — `roleClaimsChanged` short-circuits a no-op write.

**BLAST RADIUS — data exposure.** Reseeding `roles/Member` moves it from `[]` to five
coarse reads including `read:Member`, and *every* provisioned user carries the `Member`
role. The members read rule is `canDo('read','Member') || own uid`, so from that moment the
whole member directory — email, phone, profession, birthdate, positions,
permissionOverrides — is readable by any signed-in member. That is the larger irreversible
consequence of this callable, deliberate per `docs/specs/builtin-role-set.md`, and it is not
undone by re-running anything: reverting means editing `roles/Member` back down.

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
