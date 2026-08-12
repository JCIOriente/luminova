# Role lifecycle: deactivate + reactivate a role

Status: reviewed (two adversarial passes applied) · PR 3 of the role-management overhaul
(PR 1 = #216, PR 2 = #219, both merged)

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

An admin who wants that outcome should empty its `permissions` instead: same effect, no
lifecycle asymmetry, still visible on the page. So the rules lane keeps a clause barring
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
                          : d.deletedAt is timestamp && d.deletedAt == request.time);
  }
  ```

  Every conjunct is load-bearing, because this repo's two definitions of "inactive"
  disagree — `roleDefinitionDocSchema` requires `active: z.boolean()`
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

  `('active' in d)` has a cost worth stating: it permanently denies every *client* update to
  a legacy role doc that never carried `active` — and prod role docs are known to lag the
  seed. Such a doc is already invisible to the UI (`roleDefinitionDocSchema` rejects it)
  while live in the pipeline, so it is already broken; this makes the repair admin-SDK-only.
  Accepted: the alternative is a rule that cannot tell a legacy doc from a forged one.

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

## Residuals — documented, not fixed here

**Deactivation revokes perms, never name-keyed authority.** `computeMemberRoles` is pure
over `{trustedGrants, hadScanner}` and reads no role doc, so the `roles` claim keeps a
deactivated role's name. Complete list of gates that therefore survive deactivation
(excluding the 12 `hasAnyRole(['Admin'])` sites — Admin is `locked`, out of scope):

- `firestore.rules:177` `canCurateFeatured()` → `hasAnyRole(['Admin','ProjectManager'])`.
  A deactivated ProjectManager who is also `isDirection()` can still flip `featured` onto
  the public site.
- `firestore.rules:507` **and `:516`** — the Scanner `Attendee`-only conjunct on the
  checkIns create *and* delete arms. Restrictive, so surviving is the safe direction; both
  arms get a test.
- `use-can.ts:54` `canFeatureInitiatives`, `can-remove-entry.ts:21` (Scanner),
  `is-member-only.ts:9-15` (routing), `nav-config.ts:129` (`/positions` role allowlist),
  `board-home-layout.ts:25-35` (`PRECEDENCE`), `activities-page.tsx:40` /
  `activity-detail-page.tsx:53`.

Removing name-keyed authority means editing the cargo's `grants`. The alternative — having
`computeMemberRoles` drop names whose doc is inactive — is **rejected**: a member holding
Scanner + ActivityManager with Scanner deactivated would lose the `Scanner` name while
keeping `checkIn:Attendance` from ActivityManager, satisfying `!hasAnyRole(['Scanner'])` and
lifting the `Attendee` restriction. A deactivation must never widen anyone's authority.

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

**Other follow-ups:** `presidentClaims` mints perms from the static snapshot
(`tools/scripts/lib/president-claims.mjs:16-18`), so re-running the president seed after a
deactivation writes stale perms back until the next `onMemberWritten`; a malformed built-in
doc is dropped by `parseDocs` and re-renders as an `unsynced` row asserting full seed perms;
`getRoleDocsByBuiltInKeys` unions duplicate `builtInKey` docs undetected.

## Deploy notes

- Rules and beacon ship together. Rules alone permit a deactivation that restores seed
  perms; beacon alone is inert.
- **Verify before deploying** that prod `roles/Admin` really carries `locked: true` — it is
  the only structural anti-lockout guard, and prod role docs are known to lag the seed.
- `reseedBuiltInRolePerms` already skips inactive (`recompute-claims.ts:134-137`) and
  `seedBuiltInRoles` is create-only (`seed-roles.ts:46-49`), so neither resurrects a
  deactivated role. Both get a regression test.
- Deactivating a built-in fans out to a full members scan (`index.ts:298`) — the cost
  accepted and documented in PR 2.
