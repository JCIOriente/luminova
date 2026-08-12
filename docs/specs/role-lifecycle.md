# Role lifecycle: deactivate + reactivate a role

Status: implemented · PR 3 of the role-management overhaul (PR 1 = #216, PR 2 = #219, both
merged). Plan: `docs/plans/2026-08-12-role-lifecycle.md`.

## Problem

`/permisos` cannot take a built-in role out of service, and nothing in the app can bring
any deactivated role back.

Renaming already works and is NOT part of this PR. `firestore.rules:387-392` permits an
Admin to edit any non-identity field on a non-`locked` role including built-ins,
`RoleRepository.update` writes `name`/`description`/`permissions`
(`role-repository.ts:52-57`), `RolesPanel` opens the editor for a non-locked built-in
(`roles-panel.tsx:95-99`, labelled "Editar"), `RoleEditor` leaves the name input enabled
(`role-editor.tsx:86`, `disabled={locked}`), and `roleDefinitionSchema` imposes only
`min(1)` (`role-definition-schema.ts:11`). The chain is intact. The one gap is that **no
test pins a built-in `name` write as allowed** — the rules suite covers only `permissions`
(`rules.test.ts:2267-2272`) — so PR 1's headline behavior is unguarded. This PR adds that
test and nothing else on the rename axis.

Two things block the delete/restore half:

1. **Deactivation is denied on purpose.** `firestore.rules:391-392`:

   ```
   && (resource.data.get('builtIn', false) != true
       || request.resource.data.get('active', true) == true);
   ```

   The comment at `:385-386` says why: deactivating "would silently restore its seed perms
   via the trigger fallback". That is accurate. `firestore-deps.ts:71` filters the built-in
   doc query with `isActiveRoleDoc`, so an inactive doc never reaches `resolveMemberPerms`;
   `resolve-member-perms.ts:28-31` then sees the key as uncovered and substitutes
   `BUILT_IN_ROLE_PERMS[role]`. **A missing doc and an inactive doc are indistinguishable
   to the perms pipeline**, and the fallback exists for a real reason (the pre-seed window
   on a fresh project must still mint perms). The rule is a workaround for that ambiguity,
   not an independent invariant.

2. **Nothing can reactivate.** `softDeleteSafe()` (`firestore.rules:38-41`) hard-blocks
   `active: false -> true`; it is shared by five call sites across four collections
   (`:311`, `:336` members; `:360` positions; `:390` roles; `:399` allies).
   `RoleRepository.getAll()` filters `where("active","==",true)` (`role-repository.ts:39`),
   so a deactivated role is invisible to the only UI that could restore it, and no
   repository in the codebase has a `reactivate` method. (`member-row-menu.tsx:73` ships a
   "Reactivar" item, but it writes `membershipStatus`, not `active` —
   `member-repository.ts:113`. Role copy says "Reactivar rol" to avoid overloading it.)

So: make INACTIVE distinguishable from MISSING, unblock deactivation, add a restore path.

## Non-goals

- Hard delete. `allow delete: if false` stays everywhere.
- Deactivating the `locked` Admin role, or the `Member` role (see Design 5).
- Renaming (shipped in PR 1 — only its missing test is in scope).
- The `canAssignBoardPositions` checkbox — PR 4.
- Migrating `canCurateFeatured()` from a role name to a perm — see Residuals.
- Refresh-token revocation — see Residuals.

## Design

### 1. Three-way perms resolution (load-bearing)

`resolveMemberPerms` must distinguish three states per built-in key:

| doc state | contributes | key covered? |
|---|---|---|
| absent | `BUILT_IN_ROLE_PERMS[key]` (seed fallback — pre-seed window) | no |
| present and `isActiveRoleDoc` | the doc's live `permissions` | yes |
| present and not `isActiveRoleDoc` | **nothing** | **yes** |

"Active" here means `isActiveRoleDoc` (`role-doc.ts:26`) — `active !== false` **and** `deletedAt`
null-ish — not the `active` field alone. So `active: true` with `deletedAt` set is covered and
contributes nothing, which is the conservative direction.

- `RolePermsDeps.getRoleDocsByBuiltInKeys` widens to
  `Pick<RoleDefinition, "permissions" | "builtInKey" | "active">[]` and returns inactive
  docs too.
- `firestore-deps.ts:71` drops `isActiveRoleDoc` from the filter and maps `active` on.
  **The `d.get("builtIn") === true` conjunct on that line stays** — impostor defense,
  unrelated. But note the consequence in change 2 below.
- `resolve-member-perms.ts` computes `covered` from *every* returned doc, then passes only
  the active ones into `resolveEffectivePerms`.
- `getRolesByIds` (custom roles by doc id) keeps filtering inactive out — no fallback on
  that path, so dropping the doc already yields zero perms. A deactivated *built-in*
  referenced by doc id in `members.roleIds` therefore also contributes nothing. Consistent.

**`resolveMemberPerms` has two production callers, not one:** `claims-sync/sync.ts:94` (the
trigger) and `set-user-roles.ts:59-64` (the `setUserRoles` admin callable). Both inherit the
new semantics.

The callable cannot get an end-to-end test here. It builds
`firestoreClaimsDeps(getFirestore(), getAuth())` internally and calls
`setCustomUserClaims`, while `apps/beacon`'s `test:emulator` boots
`emulators:exec --only firestore` — so `FIREBASE_AUTH_EMULATOR_HOST` is unset and a `.run()`
invocation would write claims to **production Auth**. That is why the existing
`set-user-roles.test.ts` covers only `validateSetRolesInput`. Coverage instead pins the
shared deps + resolver against the real Firestore emulator, which is the whole of what the
callable wraps. Booting the auth emulator for that suite is a separate decision.

### 2. `roleClaimsChanged` must compare `builtIn` before the active check

`role-change.ts:37-38` early-returns `false` when both sides of the write are inactive, on
the reasoning that an inactive doc "contributes nothing regardless of its perms or builtIn
flag". Change 1 falsifies the `builtIn` half: inactive + `builtIn:true` is *covered* and
contributes nothing, while inactive + `builtIn:false` is *uncovered* and re-mints
`BUILT_IN_ROLE_PERMS[key]` through the fallback. So a `builtIn` flip on an inactive doc
changes every holder's perms and fires no fan-out.

Client-unreachable (`roleIdentityUnchanged()` pins `builtIn`), so this is console /
admin-SDK only — but it is exactly the invariant the deleted rule existed to protect.
Move the `builtIn` compare above the short-circuit. `builtInKey` is already the first
conjunct (`role-change.ts:31`, before `isActiveRoleDoc` is called at `:33`) — only
`builtIn` at `:42` sits below it, so this is one move, not two.

### 3. One role list, explicit filtering at the assignment surfaces

`previewEffectivePerms` (`effective-preview.ts:25-27`) mirrors the built-in collapse and
must implement the same three-way — **and its custom-role path (`:28-30`) has no `active`
filter at all**, correct today only because the hook it is fed is active-only. Members do
retain `roleIds` naming deactivated custom roles (`softDelete` never scrubs `roleIds`), so
the mirror must go three-way on *both* paths.

My first draft kept `useRoles()` active-only and added a second inclusive hook. That
rationale was wrong: it claimed widening would leak an inactive role into the cargo-grants
picker, but `position-form.tsx:55` builds options via `roleOptions(roleDocs)`, which derives
from `ROLES` and uses the docs only for labels (`role-display.ts:62-68`, deliberately, per
its own comment). Deactivated built-ins are **already** offered there. Keeping the hook
narrow protects nothing and guarantees the two lists drift.

So: **`useRoles()` becomes one query with no `where` clause, returning every role doc.**
Each consumer then states its own intent. Seven call sites across six files:

| site | kind | change |
|---|---|---|
| `member-roles-panel.tsx:33` (`customRoleOptions`, `:63`) | assignment | filter `active` |
| `notifications-page.tsx:88` (`ComposeForm` audience) | assignment | filter `active` |
| `position-form.tsx:54` → `roleOptions` | assignment (total over `ROLES`) | label deactivated keys "… (desactivado)" — keep the option, kill the ambiguity |
| `permisos-page.tsx:41` | overview | render inactive rows (Design 4) |
| `position-table.tsx:104` → `roleDisplay` | display | none — now resolves the real name instead of the stale snapshot |
| `member-permissions-panel.tsx:11` → `roleDisplay` | display | none, same improvement |
| `notifications-page.tsx:173` (`SentHistory`) | display | none |

The filter lives in ONE exported helper (`assignableRoles`), not copy-pasted per surface,
and each assignment surface gets a test asserting a deactivated role is absent. That test
per surface is the actual guard — the type system cannot express "this list must be
filtered".

### 4. `/permisos` rendering

`RoleOverviewRow` gains `active: boolean`. An inactive built-in doc is now a `seeded` row
(`role-display.ts:35` matches on `builtInKey` with no active check, so it is found and
excluded from `unsynced`).

The row must not report `permissions: []`. The update lane still permits editing
`permissions` on an inactive doc, and `role-change.ts:37-38` makes that edit silent — so
the stored array is real, editable, and is exactly what "Reactivar rol" will mint to every
holder at once. Reporting `[]` would hide it. The row keeps the **stored** array and the UI
states both facts: "N permisos · inactivo — se otorgarán al reactivar". The reactivate
confirmation shows that set plus the holder count.

`holders` is still computed for an inactive role (it routes through `effectiveRoles`, pure
over `positions.grants` — doc-state-independent). Caveat to label: holders come from
`useMembers()` → `where("active","==",true)` (`member-repository.ts:38`), while the
`onRoleWritten` fan-out has no active filter (`index.ts:298`), so soft-deleted members with
a surviving Auth user do receive the perms. The count is labelled "miembros activos" and
must not be presented as the complete blast radius.

`RoleEditor.canDelete` relaxes from `!role.builtIn` to
`!role.locked && role.active && role.builtInKey !== 'Member'`. The `role.active` conjunct is
required, not cosmetic: `roleLifecycleSafe()` permits re-stamping `deletedAt` on an already
inactive doc, so without it a deactivated role opens with a live "Desactivar rol" button
beside the panel's "Reactivar rol". Copy is "Desactivar rol" (soft, reversible), not
"Eliminar rol", and states the holder count.

**`/permisos` must stop failing closed on unrelated queries.** `permisos-page.tsx:56,71`
gates the whole page — including the only restore affordance — on
`positionsError || membersError || rolesError`, so one bad members read makes a deactivated
role permanently unrestorable in the UI.

That union is deliberate, not an oversight: `permisos-page.test.tsx:74-108` pins each of the
three queries independently, and its comment argues that dropping a term lets a positions
outage render every row as "Ningún cargo lo otorga" — a wrong authorization picture
presented as fact. Both concerns are legitimate, so neither the union nor a bare
`roles`-only gate is acceptable. `RolesPanel` renders off the `roles` query alone, and the
`grantingCargos` / `holders` lines carry their OWN per-section state — "Cargando…" or "No
disponible" — so a failed positions read never renders as an authoritative "nobody". The
nine existing tests get rewritten against that per-section contract, not deleted.

### 5. `Member` is not deactivatable

`computeMemberRoles` injects `"Member"` into every member's claim unconditionally
(`compute-roles.ts:9`), and `roles/Member` is `locked: false`. Deactivating it strips
`read:Member`, `read:MemberPoints`, `read:Activity`, `read:Program`, `read:Project` from
every provisioned user in the chapter, via an unbounded no-retry members scan
(`index.ts:298-311`) — and the restore is a second one. Nav and route access collapse for
everyone (`nav-config.ts:88-146`) and the `members` list is denied below Treasury.

An admin who wants that outcome should empty its `permissions` instead — no lifecycle
asymmetry, and still visible on the page. Not, however, the *same* effect, as an earlier draft
claimed: `packages/auth/src/ability.ts` confers several CASL grants keyed on the `Member` role
**name**, and those survive an emptied `permissions` array. The UI would keep offering
surfaces whose writes the rules then deny. Emptying the array is the better of two imperfect
options, not a clean equivalent. So the rules lane keeps a clause barring
`active: false` when `builtInKey == 'Member'`, mirrored in the UI, with a rules test.
The `locked` guard protects `roles/Admin` only and is not a substitute.

**This clause and the deletion of `:391-392` must land in a single commit.** Deleting first
leaves a commit in which an Admin can strip the five `Member` read perms from every
provisioned user through the unbounded no-retry scan at `index.ts:298-311`.

### 6. Rules

- Delete the `builtIn`/`active` clause at `:391-392`.
- Replace `softDeleteSafe()` **in the roles lane only** — `softDeleteSafe` itself must not
  change; four collections depend on its one-way semantics and member resurrection is
  pinned denied at `rules.test.ts:1038`. The roles helper:

  ```
  function roleLifecycleSafe() {
    let d = request.resource.data;
    return ('active' in d) && (d.active is bool) && ('deletedAt' in d)
      && (d.active == true ? d.deletedAt == null
                          : d.deletedAt is timestamp
                            && (unchanged('deletedAt') || d.deletedAt == request.time));
  }
  ```

  The `unchanged('deletedAt')` alternative is required, not a loosening. Demanding
  `deletedAt == request.time` on *every* write that leaves the doc inactive denies
  `RoleRepository.update`, which writes only `name`/`description`/`permissions` — so every
  edit to a deactivated role would 403, including the stored `permissions` array that
  Design 4 calls real and editable and that "Reactivar rol" mints to every holder. The
  audit stamp still holds where it matters: a `null -> timestamp` transition can never
  satisfy `unchanged()`, so deactivation must stamp `request.time`.

  Two of the four conjuncts are genuinely falsifiable and two are not. A mutation sweep
  (delete one conjunct, re-run the suite) shows `d.active is bool`, `d.deletedAt is
  timestamp`, the `unchanged`/`request.time` pair and the `active`↔`deletedAt` coupling each
  go red. The two `in` checks cannot: an absent-key read *errors*, and an erroring rule
  already denies, so nothing becomes allowed without them. They are kept as explicitness,
  not as guards — the earlier claim that all four were load-bearing was wrong.

  The type checks matter because this repo's two definitions of "inactive" disagree —
  `roleDefinitionDocSchema` requires `active: z.boolean()`
  (`role-definition-doc-schema.ts:21`) so a malformed doc is dropped by `parseDocs` and
  becomes invisible to the UI, while `isActiveRoleDoc` reads `active !== false`
  (`role-doc.ts:26`) so the same doc stays LIVE and keeps minting perms:
  - without `'active' in d`, a `deleteField('active')` write yields a ghost — invisible in
    the UI, live in the pipeline, unrestorable;
  - without `d.deletedAt is timestamp`, a string `deletedAt` yields the inverse — invisible
    in the UI, dead in the pipeline, with no path back;
  - without the `active`↔`deletedAt` coupling, `active:true` + `deletedAt` set is live to
    `getAll()`'s `where` and dead to the pipeline: assignable everywhere, minting nothing,
    and for a built-in also *covered*, so the seed fallback silently vanishes too.

  The two `in` checks have a cost worth stating: they permanently deny every *client* update
  to a legacy role doc missing `active` **or** `deletedAt` — including an ordinary `/permisos`
  permission edit.

  An earlier draft of this paragraph claimed a doc with `active: true` but no `deletedAt`
  "renders and works fine today". That was wrong. `roleDefinitionDocSchema` has always
  required `deletedAt` (`clientTimestampSchema` is a `z.custom`, whose check *does* run on
  `undefined`), so `parseDocs` already drops such a doc and it never produces a `/permisos`
  row. Both missing-field cases are therefore *already* invisible to the UI while
  `isActiveRoleDoc` keeps calling them live and the pipeline keeps minting their
  `permissions` — a worse pre-existing state than described.

  A second correction, to the sentence that replaced the first: such a doc is **not**
  admin-SDK-only to repair. `request.resource.data` is the post-write state, so a targeted
  client `updateDoc(ref, { deletedAt: null })` makes `('deletedAt' in d)` true and satisfies
  the helper. What is missing is an *affordance*, not authority — the doc renders no row, so
  no UI can offer the repair. Only a doc missing **both** fields is genuinely unrepairable
  from the client, since healing either one alone still fails the other's `in` check. Hence
  deploy check 2 below, and the follow-up to have
  `reseedBuiltInRolePerms`' dry run report docs missing these fields — it already walks every
  role doc, so the check is nearly free and replaces a prose instruction with a real signal.

  `deletedAt` value forgery has no authorization effect — every consumer
  (`role-doc.ts:26`, `recompute-claims.ts:192`, `role-definition-doc-schema.ts:22`) tests
  null-ness only, never ordering. `== request.time` is audit hygiene.

  Use `.get()` on the `resource` side: `softDeleteSafe`'s bare `resource.data.active` reads
  error rather than deny cleanly on a doc missing the field.

- **Close the same ambiguity on create.** `:380-383` checks only `builtIn`, `builtInKey`,
  `locked` — an `addDoc` omitting `active` produces a doc that `where("active","==",true)`
  cannot match and `roleDefinitionDocSchema` rejects, yet `isActiveRoleDoc` calls active and
  `getRolesByIds` mints its `permissions` to any member naming it in `roleIds`: a live
  `manage:all` role invisible on the page whose job is to show exactly that. Require
  `active == true && deletedAt == null` on create.
- `locked`, `builtIn`, `builtInKey` stay immutable via `roleIdentityUnchanged()`.

`rules.test.ts:2293-2297` ("denies deactivating a built-in role") asserts the behavior being
removed. **Replace, do not delete** — the invariant it stood in for ("an inactive built-in
must not restore its seed perms") moves to the beacon three-way, and both halves need a test
or the guard evaporates.

### 7. Repository + hooks

`RoleRepository.reactivate(id)` writes `active: true, deletedAt: null`.
`useReactivateRole()` beside `useDeleteRole()`, same invalidation.

`getAll()` loses its `where` and gains no `.limit`, so it becomes an unbounded collection
read — a deliberate exception to the repo's "bound every query" guardrail, not drift.
`roles` is capped in practice by `PERMISSION_CAP`-sized admin curation and is read only by
Admins, and a `.limit` here would silently omit a role from the one page whose job is to show
every live power grant — the failure mode the guardrail exists to prevent, inverted. The
removal of the `where` is asserted by a test, so re-narrowing it goes red loudly.

## Residuals — documented, not fixed here

**Deactivation revokes perms, never name-keyed authority — and a deactivated role's name is
still newly GRANTABLE.** `computeMemberRoles` is pure over `{trustedGrants, hadScanner}` and
reads no role doc, so the `roles` claim keeps a deactivated role's name. Complete list of
gates that therefore survive deactivation (excluding the 12 `hasAnyRole(['Admin'])` sites —
Admin is `locked`, out of scope):

- `canCurateFeatured()` in `firestore.rules` → `hasAnyRole(['Admin','ProjectManager'])`.
  A deactivated ProjectManager who is also `isDirection()` can still flip `featured` onto
  the public site.
- The Scanner `role == 'Attendee'` conjunct on **both** the `checkIns` **create** arm and the
  `checkIns` **delete** arm (the delete arm reads `resource.data.role`, since a delete carries
  no `request.resource`). Restrictive, so surviving is the safe direction; both arms get a
  test. Cited by arm rather than by line: these two line numbers have been wrong in this doc
  three times running.
- `use-can.ts` `canFeatureInitiatives`, `can-remove-entry.ts` (Scanner), `is-member-only.ts`
  (routing), `nav-config.ts` (`/positions` role allowlist), `board-home-layout.ts`
  (`PRECEDENCE`), `activities-page.tsx` / `activity-detail-page.tsx`.

This is NOT limited to existing holders keeping a name they already had — an earlier draft of
this section framed it that way and the beacon comment above
`assertRequestedRolesActive` repeated it. There are **two Admin-level paths that newly write a
deactivated role's name into a claim**, and only one is closed:

- **`setUserRoles` (CLOSED).** `assertRequestedRolesActive` rejects any requested role whose
  `roles/{key}` doc exists and is not live. An ABSENT doc is still accepted, because the
  pre-seed window legitimately falls back to `BUILT_IN_ROLE_PERMS`.
- **A cargo `grants` assignment (OPEN BY DESIGN).** `roleOptions` deliberately keeps a
  deactivated built-in in the cargo-grants picker (marked "… (desactivado)"), rules never
  check role liveness on the `positions` lane, and `resolveTrustedGrants` →
  `computeMemberRoles` writes that name into the claim of a member freshly assigned to that
  cargo. `resolveTrustedGrants` honors the grants only when `assignedBy` holds Admin — the
  same authority `setUserRoles`' `requireAdmin` demands — so the two doors sit at one
  privilege level and closing one narrows nothing.

Removing name-keyed authority means editing the cargo's `grants`. The alternative — having
`computeMemberRoles` drop names whose doc is inactive — is **rejected**: a member holding
Scanner + ActivityManager with Scanner deactivated would lose the `Scanner` name while
keeping `checkIn:Attendance` from ActivityManager, satisfying `!hasAnyRole(['Scanner'])` and
lifting the `Attendee` restriction. A deactivation must never widen anyone's authority. That
is also why the gate lives in the callable and not in `computeMemberRoles`: refusing on the
trigger path is what would cause the escalation.

**The `PERMISSION_CAP` interaction is intended, not a bug.** `sync.ts:100-111` fail-closes
to `perms: []` above 30 codes. Deactivating a role that contributed 2 unique codes can take
a member from 31 (zero perms) to 29 (all 29 minted), so the deactivation appears to widen
them. Those 29 were legitimately granted and the cap was suppressing them; restoring them
is correct. Worth logging, not blocking.

**Claims propagation window.** Nothing calls `revokeRefreshTokens`, and the client decodes
claims once per `onAuthStateChanged` (`auth-store.ts:53-58`, no `onIdTokenChanged`), so a
revoked perm survives in a long-lived tab until reload and in rules for the token's
remaining lifetime. This is true of every perm change today, not new here; revoking on a
built-in deactivation would sign out the chapter. Follow-up.

**The `Member` bar is a rules guard, so the admin SDK and the console bypass it.** A console
write of `active: false` onto `roles/Member` mints zero perms for every provisioned user, and
this PR makes the *recovery* harder rather than easier: `reseedBuiltInRolePerms` skips
inactive docs and `seedBuiltInRoles` is create-only, so neither callable can heal it. The fix
is a console edit setting `active: true, deletedAt: null` back on that one doc. Accepted
rather than hardened: adding a "the Member key is always live" special case to the perms
pipeline would make the three-way lie about doc state to defend against a console action by
someone who already has broader powers.

**A legacy built-in doc missing `active` entirely still resolves as active and contributes.**
`isActiveRoleDoc` returns true for `undefined`, while `roleDefinitionDocSchema` rejects the
doc — so it mints perms while being invisible on `/permisos`. Pre-existing, and `('active' in
d)` in `roleLifecycleSafe()` now also denies client updates to it (see Design 6).

**`assignableRoles` filters, it does not repair.** `MemberRolesPanel` keeps a deactivated
`roleId` in state and re-persists it on save, deliberately — the assignment returns when the
role does. But `members.roleIds` therefore accumulates ids of roles that may never come back,
and no scrub path exists anywhere. The panel surfaces them so they are at least visible.

**If prod's `roles/Member` doc lacked `builtInKey`, both the rules bar and the UI bar would
miss it** — each keys on `builtInKey == 'Member'`. The outcome is inert rather than dangerous:
the same missing key makes `getRoleDocsByBuiltInKeys` fail to match the doc, so the key stays
uncovered and the seed fallback mints `Member`'s perms whatever the doc's `active` says.
Deactivating it would change nothing. Cosmetic inconsistency, not a hole.

**The well-formedness half of `roleLifecycleSafe()` is collection-agnostic, and only `roles`
got it.** The four remaining `softDeleteSafe()` lanes (members ×2, positions, allies) have
neither an `active is bool` check nor the `active`↔`deletedAt` coupling, and the hazard is
concrete rather than theoretical: a member doc carrying the *string* `"false"` in `active`
passes `softDeleteSafe`, is dropped by `memberDocSchema` (so it is invisible in backstage),
yet `apps/beacon/src/showcase/project-board.ts` tests `member.active === false` — so it would
still be projected to the **public** board showcase. (`project-ally.ts` uses the safe
`!== true` direction.) Generalizing here would mean four more write lanes, four more rules-test
groups, and four repeats of the prod field audit that is already this PR's riskiest
operational step — so the fork is deliberate. Owed its own pass.

**Duplicate `builtInKey` docs — divergence FIXED, union documented.** The mirror used to build
a `Map` and keep only the last doc while beacon unioned every live one, so the preview an
Admin reads was order-dependent and could show `[]` where beacon minted real perms. The
mirror now groups and unions, matching beacon; both orders are pinned by tests. The union
*itself* remains the semantic: two docs claiming one key means deactivating one does not
revoke what the other still grants. Beacon logs the condition. Console-authorable only.

Still open, and never weighed during design (so: not a rejected option): the three-way
algorithm is implemented twice, once per side of the trust boundary. A shared pure helper in
`packages/auth` — which both sides already import `resolveEffectivePerms` from, so no new
dependency and no cycle — would remove the duplication of the subtle half while leaving the
`isLiveRole` / `isActiveRoleDoc` predicate mirror where it must stay.

**Cross-surface label consistency — mostly resolved.** `roleOptions` marks a deactivated
built-in "… (desactivado)"; the two surfaces that *assert* authority rather than offer a
choice — the member permissions panel and the `/positions` grants column — now mark it too,
through the same lifecycle-aware resolver. What stands: the marker is a plain string baked
into the label, so it is unstyleable and only string-testable.

**Beacon test files are not type-checked at all — recommended follow-up.**
`apps/beacon/tsconfig.json` carries `"exclude": ["src/**/*.test.ts"]`, so the `tsc --noEmit`
inside `pnpm --filter beacon run ci` never reads a single test file. This was found the hard
way: a type-level pin written for `computeMemberRoles` passed `tsc` while the source was
mutated into all three shapes it was meant to forbid. Any type-level assertion in a beacon
test today gates nothing, which is guardrail #6 territory. Including them surfaces 14
pre-existing errors, all one trivial class (a `readonly []` from an `as const` not assignable
to a mutable parameter). Cheap to clear: fix that constant, drop the `exclude`. Deliberately
out of scope here — it is a CI-contract change, and this branch already carries one.

**Other follow-ups:** `presidentClaims` mints perms from the static snapshot
(`tools/scripts/lib/president-claims.mjs:16-18`), so re-running the president seed after a
deactivation writes stale perms back until the next `onMemberWritten`; a malformed built-in
doc is dropped by `parseDocs` and re-renders as an `unsynced` row asserting full seed perms;
`getRoleDocsByBuiltInKeys` unions duplicate `builtInKey` docs undetected.

## Deploy notes

- **Order: beacon → rules → hosting.** Beacon first is inert on its own. Rules before
  beacon would permit a deactivation that restores seed perms. Hosting before rules ships
  two buttons whose writes `main`'s rules still deny — `softDelete` on a built-in and
  `reactivate` on anything — so `/permisos` would offer visibly broken affordances.
- **Three prod verifications, all prerequisites rather than hygiene.** Prod role docs are
  known to lag the seed, and each of these fields is a condition the design silently depends
  on:
  1. `roles/Admin` carries `locked: true`. Reduced from a hard prerequisite to a
     belt-and-braces check: the roles lane now also bars deactivating `builtInKey == 'Admin'`
     outright, mirroring the `Member` clause, so a `locked` field that lags the seed no longer
     lets one Admin write strip `manage:all` chapter-wide. Still worth confirming.
  2. Every `roles/*` doc is **well-formed on all SIX fields the update lane now checks**, plus
     a seventh audit below. The update arm runs `roleLifecycleSafe()` **and**
     `roleShapeValid()`, so this check is three fields wider than the earlier draft of this
     note (which named only `active`/`deletedAt`):
     - `active` — present and `is bool`
     - `deletedAt` — present (and coupled to `active`: `true`→`null`, `false`→a timestamp)
     - `name` — present, `is string`, `size()` in `1..100`
     - `description` — present and `is string`
     - `permissions` — present and `is list`
     - `locked` — present and `is bool`

     **Consequence, once, for all six:** a doc failing ANY of them is denied on **every**
     client update — including its own reactivation and including an ordinary `/permisos`
     permission edit. It becomes admin-SDK/console-only to edit. A legacy prod doc missing
     `description`, or missing `locked`, is exactly as locked out as one missing `active`.

     **Seventh thing to audit: `name.length > 100`.** The rules' `name.size() <= 100` bound has
     no zod counterpart — `roleDefinitionSchema` is `.min(1)` only — and PR 1 shipped built-in
     role renaming with no upper bound. So a prod doc may ALREADY carry a name longer than 100
     characters, which after this deploy can never be updated from the client. Audit for it
     before deploying; the matching client-side bound (so the form pre-validates instead of
     403-ing) lands separately.
  3. Every built-in doc carries `builtIn: true` **and** `builtInKey` equal to its doc id.
     **Now a real signal, not a manual check:** run `reseedBuiltInRolePerms` with
     `{ dryRun: true }` and read `coverageAnomalies`. It reports every doc whose `builtIn` is
     not `true` or whose `builtInKey` is absent or mismatched. That callable is the only code
     that can see this class at all — it reads all nine `roles/{key}` docs BY ID, whereas the
     claims pipeline's `where("builtInKey","in",keys)` query only ever inspects docs it
     MATCHED, so a doc with an absent or mis-cased `builtInKey` is invisible to every one of
     beacon's three anomaly logs. Reported, not folded into `failed` — `failed` stays the
     "run `seedRoles` first" shorthand for the `missing` ids, and an anomaly needs a console
     field edit instead.

     The halves fail differently, and two earlier drafts of this note conflated them:
     - **Missing `builtIn: true`** → the doc is dropped by the `builtIn === true` filter. Its
       key stays *uncovered* **unless another `builtIn: true` doc claims the same key**, and
       when uncovered the seed fallback re-mints — making a deactivation a **silent no-op that
       `/permisos` reports as a revocation**.
     - **`builtInKey` absent** → the field query never MATCHES the doc, so its key is uncovered
       and served from `BUILT_IN_ROLE_PERMS` forever. The one shape no log can see.
     - **`builtInKey` present but ≠ doc id** → the doc IS returned (the query matches on the
       field) and does cover the key it names. The hazard is that `reseedBuiltInRolePerms`
       keys on the doc id, so this doc's permissions **freeze permanently** while `/permisos`
       shows the role as normal. The SIGNAL differs by sub-case, and the earlier claim that
       the callable "still returns `ok: true`" is only right for one of them:
       - the doc's own id **is** a `ROLES` key (e.g. `roles/Member` carrying
         `builtInKey: "Treasury"`) → read and skipped `not-built-in`, which is not added to
         `failed`, so `ok: true`;
       - the doc's own id is **not** a `ROLES` key (e.g. `roles/Tesoreria` carrying
         `builtInKey: "Treasury"`) → the reseed never reads that doc at all, and instead
         reports `roles/Treasury` as `missing` + `failed`, so **`ok: false`**.

     Beacon logs the three anomalies it can see (dropped-not-`builtIn`, off-id `builtInKey`,
     two docs sharing one key) with the per-sub-case reseed signal spelled out; the dry-run
     report above covers the ones it cannot.
- **Two log lines to watch after any role write, both new.** `onRoleWritten` now emits a
  `console.info` fan-out START line (role id + member count) before the loop, so a 540 s
  timeout — the documented way this fan-out strands members — is no longer byte-for-byte
  indistinguishable from a clean run: alert on a start with no matching completion. And both
  `onRoleWritten` and `recomputeAllClaims` re-read the built-in role docs once after their
  loop and log `staleRoleKeys` if a role doc changed underneath them; the operator response to
  either is `recomputeAllClaims`. See "the memo is not safe on its own" below.
- **Two role writes inside 540 s can strand a member, and the fix is observability, not
  correctness.** `firestoreClaimsDeps` memoizes the built-in role query per deps instance, and
  `onRoleWritten` / `recomputeAllClaims` each hold one instance for up to 540 s. Deactivate
  `roles/Treasury`; 60 s later deactivate `roles/Membership`; fan-out A, warmed before the
  second write, can then write a member's claims back WITH `Membership`'s perms after fan-out B
  correctly removed them. `retry: false` means no redelivery and no later trigger. The memo is
  kept (the timeout it prevents is the likelier failure) and a TTL was rejected — it narrows
  the window while keeping the failure silent. The divergence is logged instead.
- `reseedBuiltInRolePerms` already skips inactive (`recompute-claims.ts:134-137`) and
  `seedBuiltInRoles` is create-only (`seed-roles.ts:46-49`), so neither resurrects a
  deactivated role. Both get a regression test.
- Deactivating a built-in fans out to a full members scan (`index.ts:298`) — the cost
  accepted and documented in PR 2.
