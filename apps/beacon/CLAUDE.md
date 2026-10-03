# Beacon — Claude Code Guide

Firebase Cloud Functions backend. Owns the Recognition Engine compute (participation facts → engine-only `participations` ledger + `memberPoints` aggregate), claims sync, showcase projections, and the admin / invite callables.

## Rules

- **Admin SDK only** — never import `firebase/firestore` (client SDK); use `firebase-admin`. The engine writes the client-read-only `participations` / `memberPoints` / `members.totalPoints`.
- **NodeNext modules** — relative imports use explicit `.js` extensions. `@luminova/types` is consumed via the `/engine` pure subpath (raw-Node-ESM valid).
- **Idempotent** — deterministic participation ids + full-recompute aggregate, safe under at-least-once redelivery.
- **Layering:** pure helpers (`award-points/derive.ts`, `aggregate.ts`, `check-in.ts`, `participation-id.ts`) get unit tests; orchestration (`award-points/process.ts`) is written against the `EngineStore` port, unit-tested with an in-memory fake, no Firestore; glue (`award-points/firestore-store.ts`, `index.ts` trigger bindings) is exercised by emulator e2e, not units.
- **CI gate:** `pnpm --filter beacon run ci` (eslint → typecheck → vitest → emulator tests), rolled into `pnpm pr-tests`. Use `run ci` — bare `pnpm ci` is pnpm's reinstall builtin.

## Triggers

### `awardPoints` — `onDocumentWritten('checkIns/{id}')`

Check-ins are written by any `checkIn:Attendance` holder; a Scanner is confined to `Attendee` rows by a rules conjunct. `validateCheckIn` rejects malformed input **without throwing** (no retry storm); point values come from `pointRules/{termId}__{code}` (fallback `DEFAULT_POINT_VALUES`); writes `participations/{activityId__memberId__role}` (deterministic id), recomputes `memberPoints/{memberId}` and mirrors `members.totalPoints`; `syncActivityCheckInFlag` recomputes `hasCheckIns` transactionally with `count()` (unconditional write = conflict anchor; `firestore.rules` locks category/startAt/parentId/parentType on it). A delete removes the derived row, recomputes and re-mirrors. Runs `retry: true` (as do `onMemberCreated` and `onBoardMemberWritten`; each justifies it at the call site) — an unretried transient failure would strand the rules-side lock.

### `onProgramWritten` / `onProjectWritten` — `initiativeTrigger(...)`

When `finalReport` transitions null↔set, flip that initiative's participation rows provisional↔confirmed and recompute affected members' aggregates; also projects the showcase.

## Invite callables

### `issueMemberInvite` — `onCall` (replaces `provisionMemberLogin`)

`create:MemberLogin`-guarded. Creates/links the Auth account, sets the base `Member` claim, revokes any outstanding invite, mints a single-use token, projects `members/{id}.invite`. Returns `{ email, token, expiresAt, replacedPreviousLink }`.

- **No Firebase email anywhere in the auth flow.** Beacon returns the token, never a URL; the client assembles `https://<origin>/invitacion#<token>`.
- **The link IS the credential** — holding the token sets that member's password.
- **Revoke + mint + project is ONE batch** (`commitInviteBatch` in `provision-deps.ts`, the single `InviteDeps.commitInvite` port). Never split the three writes — a partial failure leaves an unrevocable live token.
- **Guards are an EXHAUSTIVE switch on `(user, linkedUid)`** — adoption and self-heal Admin-only; recovery and initial delegate-allowed. Never collapse to a two-way split.
- **The privilege guards re-run in `redeemInvite`** (token outlives the decision by up to 48 h); `issuedByAdmin: true` exempts.

### `describeInvite` / `redeemInvite` — `onCall`, UNAUTHENTICATED

Both share `loadValidInvite` so validity rules cannot drift.

- **Token hash IS the doc id** (`memberInvites/{sha256hex(token)}`) — no secret comparison, bounded lookup, not enumerable.
- **Rate-limited IN PROCESS, never in Firestore.** 5 calls/min per token **per callable** (a link gets 5 `describeInvite` AND 5 `redeemInvite` a minute) plus 600/min endpoint-wide per callable — the key that actually bounds a flood. Consulted before ANY read; writes nothing (a counter doc would be a guaranteed billable write per unauthenticated request). `rate-limit.ts` bounds memory (LRU, 2048 buckets). **The ceiling is per-INSTANCE** (`maxInstances: 10`; a cold start resets buckets) — never quote it as a global figure. "Times however many are warm" is headroom for legitimate traffic only, NOT the denial threshold: treat one instance as a conservative floor. The endpoint-wide bucket has SHARED FATE (exhausting it refuses everyone), so it is sized to bound cost: ~1,200 reads/min on one instance (600 calls × ≤2 keyed reads), ~12k across a saturated pool of ten. Denial threshold ~10 req/s — `INVITE_GLOBAL_DENIAL_PER_SECOND`, derived, not typed. CANONICAL for every figure: the `globalPerMinute` docblock in `packages/types/src/member-invite.ts`. A tripwire test in `redeem-invite.test.ts` pins the derived values and lists every prose site restating them, this bullet included. The request-rate alert in `docs/firebase-setup.md` stays just under the denial point.
- **App Check IS enforced in production, and deliberately NOT under the emulator** (`ENFORCE_APP_CHECK`, derived from `UNDER_EMULATOR` in `token-verification-bypass.ts`). A test pins BOTH branches. App Check bounds WHO may call, not how often — the limiter ships alongside it. For a callable the `onCall` flag IS the enforcement. Setup/diagnosis:
  `docs/firebase-setup.md`, owner op 3.
- **`issueMemberInvite` enforces App Check too; the admin-only callables do not.** Enforced list = `APP_CHECK_ENFORCED_CALLABLES`, pinned by `app-check-scope.test.ts`; rationale in `docs/firebase-setup.md`, owner op 3.
- **One debug flag defeats BOTH token verifications, and every callable refuses it.** `FIREBASE_DEBUG_MODE=true` + `FIREBASE_DEBUG_FEATURES` with `skipTokenVerification` makes firebase-functions accept unverified App Check AND Auth ID tokens (forged claims pass `callable-auth.ts`; `enforceAppCheck: true` does not help). **Every callable MUST be declared through `guardedOnCall`** (`src/guarded-on-call.ts`; design `docs/specs/structural-oncall-guard.md`; refusal on `assertTokenVerificationNotBypassed`). `FUNCTIONS_EMULATOR` cannot be guarded in-process: `.github/scripts/assert-deployed-env-clean.sh` is its only control; its service list is enumerated in `deploy.yml` and pinned by the deploy-list test in `src/redeem-invite.test.ts`.
- **`maxInstances`** caps billing but converts cost into availability; the rate gate keeps a throttled request from occupying an instance.
- **The token claim precedes `auth.updateUser`** — a crash burns the token, never leaves a replayable one.
- Logs `{ fn, memberId, tokenPrefix, outcome }` only — never the token, the password, or `request.data`. A test asserts it.

## Admin callables

### `setUserRoles` — `onCall`

Admin-guarded custom-claim assignment.

### `reseedBuiltInRolePerms` — `onCall`

Admin-guarded. Moves LIVE `roles/{id}` docs onto the current `BUILT_IN_ROLE_PERMS` snapshot. `seedRoles` is create-only (swallows `ALREADY_EXISTS`), so editing the snapshot alone never reaches production — this is the path that does.

**OPERATOR SEQUENCE — both callables, in this order.** The reseed is **update-only**: a newly added built-in role has no `roles/{id}` doc in production and comes back `skipped` reason `missing` (and in `failed`), staying "sin sincronizar" on `/permisos` forever.

1. `seedRoles` — create-only; brings new role docs into existence.
2. `reseedBuiltInRolePerms` — update-only; moves existing docs onto the new snapshot. **Run it as `{ dryRun: true }` first and read `coverageAnomalies`** — the only signal for built-in docs whose `builtIn` is not `true` or whose `builtInKey` is absent/mismatched (invisible to the claims-sync anomaly logs). An uncovered key is re-minted from the seed, so deactivating it is a silent no-op. An anomaly needs a console field edit, not `seedRoles`.
3. `recomputeAllClaims` — the observable backstop (see BLAST RADIUS).

Skipping step 1 is the failure mode to watch for; skipping step 2 leaves incumbents on old perms.

**OWNER-OP, after the reseed — the Secretario cargo, in this order.** The reseed strips the Ally trio (`read:Ally`, `create:Ally`, `update:Ally`) from `Membership`; `Secretary` holds them now. The code-side cargo mapping (`packages/types/src/cel-positions.ts`, `tools/scripts/lib/cel-seed.mjs`) reaches a fresh project only (`seedPresident` writes `CEL_SEED` only `if (snap.empty)`), so in production this is a hand edit on `/positions` (Admin-only):

4. **ADD `Secretary` to the Secretario cargo's `grants`.**
5. **THEN remove `Admin`** from that cargo.

5 before 4, or skipping 4, leaves `create:Ally`/`update:Ally` and `manage:Lead`/`manage:Notification` held only by Admin — `/allies` and `/leads` silently vanish from that cargo's nav.

Invariants:

- Writes **`permissions` only** — never `name`/`description` (the doc owns display text; a re-run must not revert renames).
- Requires `confirm: "overwrite-builtin-roles"`.
- `dryRun: true` writes nothing; returns per-doc `{id, current, proposed}` with `current` the **raw** on-disk array, junk included.
- A doc whose `permissions` carries a code `isValidPermissionCode` rejects is **applied**, never reported `unchanged`.
- A soft-deleted built-in (`active: false` / `deletedAt` set) is skipped `inactive`, never revived.
- Skips `locked === true`; `roles/Admin` is excluded explicitly (the admin SDK bypasses the `locked` rule).
- One `WriteBatch` (≤ 9 docs) — never a doc-by-doc loop (half-applied, no rollback).
- Returns `{ok, dryRun, applied: [{id, changedFields}], skipped, failed}`; `skipped` reasons `locked` / `unchanged` / `not-built-in` / `missing` / `inactive`; `failed` = exactly the `missing` ids. **`ok` is false whenever `failed` is non-empty.**

**`recomputeAllClaims` return contract.** `{ ok, synced, failed }` where **`ok` is `failed.length === 0`**. Pinned by `recomputeClaimsResult` in `recompute-claims.ts` and its unit test. `synced` counts provisioned members only (no-`uid` docs skipped uncounted); `failed` holds member doc ids. A stale-role-snapshot warning is **logged, not folded into `ok`**; re-running is the response to both.

**BLAST RADIUS — cost.** `onRoleWritten` scans the **entire** members collection for any doc with a `builtInKey`, unbounded. Each applied doc fires its own scan and one `WriteBatch` lands them all, so a rollout is up to eight _concurrent_ full scans (sequential `getUser` + possible `setCustomUserClaims` per member) inside a 540 s budget with `retry: false`. A timeout strands the members not yet reached. **Operator instruction: run `recomputeAllClaims` afterwards as the observable backstop** — itself an unbounded scan, sharing the failure mode on a large collection. Re-running the reseed is free (`roleClaimsChanged` short-circuits no-ops).

**BLAST RADIUS — the two log lines that make a stranded member visible.** `onRoleWritten` emits a `console.info` START line before the fan-out: **alert on a start with no matching completion.** Both `onRoleWritten` and `recomputeAllClaims` re-read the memoized built-in role set after their loop and log `staleRoleKeys` (a role write landed mid-fan-out). Operator response to either:
`recomputeAllClaims`. Do not add a TTL — it keeps the failure silent.

**BLAST RADIUS — data exposure.** Reseeding `roles/Member` grants `read:Member` to every provisioned user, so the whole member directory (email, phone, birthdate, positions, permissionOverrides…) becomes readable by any signed-in member. Deliberate per `docs/specs/builtin-role-set.md`; not undone by re-running anything — revert by editing `roles/Member` down.

## Known gaps (deferred)

- Not built: dues→points voiding (roadmap J4), roster auto-expansion of director/team rows, term-window cutoff in the aggregate.
- Showcase projection gaps (board term rollover, stale team-credit names) and the boardShowcase ordering rule live in `.claude/rules/beacon-showcase.md`.
- **boardShowcase stale publication under the fail-closed `active` guard:** `projectBoard` drops a member on `deletedAt != null || active !== true`, but cannot reach a row already published for a non-bool `active` (such docs are admin-SDK-only in `firestore.rules`, and `pnpm audit:soft-delete-shapes --repair` refuses to coerce a non-bool `active`). Remedies: (a) the script's report, then a console edit of `active`; or (b) an Admin `publicProfile: false` write (the takedown arm skips `softDeleteSafe()` on purpose; a rules test pins it). Repairing a missing `active` to `true` can **add** a public row — announced per doc (`WILL PUBLISH:`) and withheld behind `--allow-publish`.
- **`pnpm audit:soft-delete-shapes` is a deploy precondition** for the well-formedness rules (owner-op 4 of `docs/specs/position-assignment-lane.md`); exits 1 on findings, 2 when the run did not complete.

## Deploy trap

A deployed function cannot change trigger type in place (HTTPS ↔ background/Eventarc); a failed first 2nd-gen Eventarc deploy can leave Firestore-trigger functions behind as HTTPS services. Fix (owner op): `firebase functions:delete <names> --region us-central1 --force`, then redeploy.
