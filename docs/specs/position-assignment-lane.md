# Position-assignment lane + role-lifecycle follow-through

**Status:** design (revised after two adversarial passes — see Review corrections)
**Branch:** `feat/position-assignment-lane`
**Predecessors:** PR 1 (#216 role display), PR 2 (#219 built-in role set), PR 3 (#221 role lifecycle)

The fourth and last PR of the role-management overhaul, plus three residuals its
predecessors documented and deferred. Four changes, one branch, because three of the four
edit `firestore.rules` and share one emulator suite.

| # | Change | Surface |
|---|---|---|
| A | Members-positions write lane keyed on `update:Position` | rules, backstage |
| B | Well-formedness on the four remaining soft-delete lanes | rules, beacon showcase |
| C | The three-way built-in resolution extracted to `packages/auth` | packages/auth, beacon, backstage |
| D | `canCurateFeatured` migrated from a role name to a permission | rules, types, beacon seed, backstage |

---

## A. The members-positions write lane

### Problem

PR 2 withdrew `manage:Position` from `ExecutiveCommittee` and deleted the dedicated
positions-only rule that went with it. Cargo assignment on `members/{id}.positions` became
Admin-only. `memberEditMode` (`apps/backstage/src/features/members/lib/member-edit-gate.ts:5`)
still declares a `"positions"` arm in its return union but its body
(`member-edit-gate.ts:15-17`) never returns it, so `member-profile-page.tsx:168-184` is
unreachable code, and its doc comment names this PR as the thing that brings it back.

### What blocks a non-Admin today

Not `positionsAssignmentSafe()`. The institutional update arm (`firestore.rules:302-312`)
leads with `canDo('update', 'Member')`, so a principal holding only `update:Position` fails
at the **first** conjunct and never reaches the positions gate at all.

### Design

A **new, fourth `allow update` arm** on `match /members/{memberId}`, rather than relaxing
the leading `canDo('update','Member')` on the existing one. Rules arms OR together, so a new
arm is purely additive and its scope is auditable in isolation.

```
// Positions-only lane: an org-chart editor who is NOT a member editor. Keyed on
// update:Position — the same capability that governs the positions CATALOG — and
// confined to the positions map. The power-cargo restriction is NOT relaxed:
// positionsAssignmentSafe()'s non-Admin branch still demands cargoGrantsEmpty() &&
// currentCargoGrantsEmpty(), so this principal assigns and clears grant-free cargos
// only, on BOTH sides of a swap.
//
// The four conjuncts after positionsAssignmentSafe() are implied by hasOnly(['positions'])
// TODAY and are stated anyway: they are the claims-mint boundary (roleIds,
// permissionOverrides, uid) and the points ledger. If hasOnly is ever widened — the
// obvious future edit is adding a second key — three invariants must not vanish with it.
allow update: if canDo('update', 'Position')
  && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['positions'])
  && positionsAssignmentSafe()
  && softDeleteSafe()
  && updatePermissionAssignmentSafe()
  && !touched('uid')
  && !touched('publicProfile')
  && unchanged('totalPoints');
```

`positionsAssignmentSafe()` is reused verbatim — **not edited**. Its `hasAnyRole(['Admin'])`
disjunct keeps Admin unrestricted; its `cargoGrantsEmpty() && currentCargoGrantsEmpty()`
disjunct is exactly the grant-empty-only semantic this lane wants. `currentCargoGrantsEmpty()`
must stay inside the non-Admin branch: without it an `update:Position` holder could overwrite
a president's power cargo with a grant-free one and silently strip Admin.

`hasOnly(['positions'])` is the correct constraint for the production dot-path payload
`{"positions.2026": {...}}` — `affectedKeys()` reports **top-level** keys, pinned by
`rules.test.ts:2262-2270` and `:1310`.

**What `softDeleteSafe()` in this arm does and does not do.** It does not stop a write onto a
soft-deleted member: it blocks *resurrection*, and `unchanged('active')` is satisfied
whenever the write does not touch `active`, which `hasOnly` guarantees. So this lane can
assign a cargo to a soft-deleted member — the same as the existing institutional arm, so not
a regression. What it does do, once change B lands, is refuse a write onto a **malformed**
member doc.

### Create is deliberately untouched

`createPositionsSafe()` cannot call `currentCargoGrantsEmpty()` — a create has no prior
`resource`. There is no old side to protect on a create, and no reason to let an org-chart
editor mint members: creation stays `canDo('create','Member')`.

### This lane is a PUBLIC publication authority — stated, and deliberately accepted

`positions.<term>.cargoId` is the sole input to `boardShowcase`, the world-readable public
Directiva (`firestore.rules:706-709`, `allow read: if true`; projection at
`apps/beacon/src/showcase/project-board.ts:63-97`). `boardGroupFromCategory`
(`packages/types/src/engine/board-public.ts:39-41`) publishes both `CEL` and `JDL`. Every
**seeded CEL** cargo carries non-empty `grants`, so the non-Admin branch blocks those. **JDL
direcciones are hand-created in `/positions` and normally carry `grants: []`** — so an
`update:Position` holder can assign a grant-free board cargo to any member, **including
themselves**, and put that person on the public site under that title. Combined with the
self-service arm (which they own for their own `publicProfile` and `profilePicture`), that is
self-publication with no Admin action.

This is **accepted as the feature**, not an oversight: assigning a JDL dirección *is* the
darkened surface PR 2 created, and appearing on the Directiva is the correct product outcome
of holding that cargo. It is not privilege escalation — no claim is minted, because
`resolveTrustedGrants` returns at `sync.ts:67` on `grants.length === 0`, before the
`assignedBy`-holds-Admin gate is even consulted.

Two things follow, and both are in scope:

1. **The catalog's `category` must stop being freely writable by a non-Admin.** Today the
   positions update arm (`firestore.rules:358-361`) pins only `grants` for a non-Admin, so an
   `update:Position` holder could retitle a grant-free Comisión to `title: "Presidente",
   category: "CEL"` (→ `boardRank` 0) and assign it to themselves. `unchanged('category')`
   joins `unchanged('grants')` in the non-Admin branch. Defensible on its own: `category`
   decides board group, board rank, and whether `comisionGrantsEmpty()` applies.
2. **The exposure is asserted, not left incidental** — a rules test pins that an
   `update:Position` holder can put a member on the board, so a future reader sees it was a
   decision.

Owner-op 1 states this in the same words, so nobody grants the capability without knowing
it publishes.

### No built-in role gains the capability, and the hand-off must be a CUSTOM role

`update:Position` is held by **no** entry in `BUILT_IN_ROLE_PERMS` — only Admin satisfies it,
via `manage:all`. This PR does not change that: every existing principal's authority stays
byte-identical, so no test asserting a current denial has to be weakened.

**The hand-off must be a custom role doc, not an edit to the `ExecutiveCommittee` built-in.**
`planRolePermReseed` (`apps/beacon/src/recompute-claims.ts:205-238`) walks **every** built-in
role doc and rewrites `permissions` to the `BUILT_IN_ROLE_PERMS` snapshot whenever they
differ — so an `update:Position` added to the CEL built-in from `/permisos` is **silently
stripped by the next reseed**, which owner-op 2 of this very spec mandates. A custom role
(`builtIn: false`) is skipped by the reseed as `"not-built-in"`. Owner-op 1 says so
explicitly.

### Client mirror

```ts
export function memberEditMode(gate: Pick<Can, "can">): MemberEditMode {
  if (gate.can("update", "Member")) return "full";
  if (gate.can("update", "Position")) return "positions";
  return "none";
}
```

Order matters and is asserted: a principal holding both gets `"full"`, so the two editors
never both render.

The rest of the UI mirror is **already correct** — `member-positions-form.tsx:42-50` filters
options on `p.grants.length === 0` and locks the form when the *current* cargo grants power,
both keyed on grants-emptiness, not on Admin. `canAssignPowerGrants` (`use-can.ts:55`) stays
a role check, mirroring `hasAnyRole(['Admin'])` in the rule.

Two stale comments must move with the code, or they read as guarantees:
`MemberRepository.setPositions` (`member-repository.ts:81-85`) says the write "goes through
the ordinary `update:Member` lane… not about a separate allow-rule" — false once this arm
exists; and `effectiveRoles` (`member-permissions.ts:3-4`) claims it "mirrors exactly what
the claims-sync trigger will mint", which omits the `assignedBy`-holds-Admin gate. The second
is pre-existing and only needs correcting, not re-implementing.

### Nav parity fix

`nav-config.ts:130` re-admits a perms-only principal to `/positions` via
`orCan: { action: "manage", subject: "Position" }`, but the catalog's own rules accept
`canDo('update','Position')`. `orCan` moves to `update` — `canDo` treats `manage:Position` as
satisfying `update:Position`, so this widens nothing the rules did not already allow
(guardrail #6).

### Tests that assert today's denial — rewritten, never deleted

| Test | Today | After |
|---|---|---|
| `member-edit-gate.test.ts:39` | `manage:Position` → `"none"` | → `"positions"`. CASL `manage` satisfies `can("update", …)` (`ability.ts:34-39`), exactly as `canDo` does in the rules |
| `member-edit-gate.test.ts:40` | `read:Position` → `"none"` | unchanged |
| `member-edit-gate.test.ts:43` | `{roles:["Member"], perms:["manage:Position"]}` → `"none"` | → `"positions"` |
| `member-edit-gate.test.ts:12` | CEL → `"none"` | unchanged — CEL holds no `update:Position` in the seed |
| `rules.test.ts:2164` | CEL denied any cargo | unchanged, plus a new `update:Position` principal that is allowed |
| `nav-config.test.ts:170` | admits `manage:Position` | passes, plus an `update:Position` case |

New rules tests. The `describe` at `rules.test.ts:2163` ends with `:2281` "allows Admin to
assign a power-conferring cargo", which is last **on purpose** — the suite seeds once and
never resets. Insert before it, and mind the fixtures: at that point `members/m1` holds
`pos_soft` (grant-free, set at `:2173`, re-set at `:2262`), **not** a power cargo, so the
old-side test must target `members/m_powercargo` (`:505-512`), which the C1 describe at
`:2290` also uses as `assertFails` — safe to share.

- allows an `update:Position`-only principal to assign a grant-free cargo, self-stamped
- **positive-and-inert**: after that assignment, the computed claims are unchanged — asserts
  "cannot mint" rather than inferring it
- BLOCKING: denies that principal assigning a power-conferring cargo (new side)
- BLOCKING: denies that principal replacing `m_powercargo`'s cargo with a grant-free one (old side)
- BLOCKING: denies that principal touching any non-`positions` field in the same write
- denies a forged `assignedBy`; denies a non-current-term write; denies creating a member
- denies a whole-map replacement that drops the current term key, and a `deleteField()` on
  `positions` — both currently deny via `assignedBySelf()`, an incidental mechanism that a
  future refactor could remove unnoticed
- pins the accepted exposure: an `update:Position` holder can assign a grant-free JDL board cargo
- denies a non-Admin changing a position's `category` (the new catalog conjunct)

Every new create-shaped test carries `active`/`deletedAt`, or change B makes it vacuous.

### Residual: the term-rollover window

`currentCargoGrantsEmpty()` reads `resource.data.positions[currentTermKey()].cargoId`. At the
UTC-year rollover a victim whose Admin comes from `positions["2026"]` has an empty
`positions["2027"]` slot, so the guard hits its `prior == null` short-circuit and an
`update:Position` holder can write a grant-free cargo into the new term — and
`syncMemberClaims`, which resolves from the same current-year key, recomputes
`roles: ['Member']`. **Pre-existing** — it falls to any `manage:Member` holder through the
institutional arm today, and A does not create it — but the guard is not unconditional, and
this spec says so rather than repeating "closes the strip-Admin hole" without qualification.
A test pins the shape. Fixing it properly means resolving liveness across terms and is its
own pass.

---

## B. Well-formedness on the remaining soft-delete lanes

### Problem

`roleLifecycleSafe()` enforces that `active` is present and a bool and `deletedAt` is
present. The four `softDeleteSafe()` lanes — `members` ×2, `positions`, `allies` — enforce
neither. The hazard is concrete: a member doc carrying the **string** `"false"` in `active`
passes `softDeleteSafe()`, is dropped by `memberDocSchema` so it is invisible throughout
backstage, and is **published to the public Directiva**, because
`apps/beacon/src/showcase/project-board.ts:75` tests `member.active === false` — the
fail-open direction. `project-ally.ts:22` uses the fail-closed `active !== true`.

### Design — three parts

**B1. The check goes inside `softDeleteSafe()`, not onto the arms.**

```
function softDeleteSafe() {
  let d = request.resource.data;
  return ('active' in d) && (d.active is bool) && ('deletedAt' in d)
    && (resource.data.deletedAt == null || unchanged('deletedAt'))
    && (resource.data.active == true || unchanged('active'));
}
```

Inside the helper, because the members Admin-takedown arm (`firestore.rules:320-322`)
deliberately does **not** call it. That arm is the only rules-level path that can unpublish
exactly the malformed member this change is about; putting the requirement at arm level would
remove the remedy along with the disease.

The one-way semantics below the new lines are untouched. Two in-file comments assert
"softDeleteSafe itself must not change" (`firestore.rules:371-375`, `rules.test.ts:2529-2533`);
both are updated to say what changed and what did not.

**This is a real new denial, not a reclassification — corrected from the first draft.** The
first draft argued the missing-field case already denies, because `softDeleteSafe` reads
`resource.data.active` bare and an absent-key read errors. That is **false**: rules are CEL,
whose `||` absorbs errors (`error || true == true`), and the bare read sits on the left of a
`||` whose right side is `unchanged(field)` — which uses `.get(…, null)` and returns
`null == null → true` on an absent key. Measured against the emulator: a doc missing
`active`/`deletedAt` is **editable today** and **denied** after B1. The same wrong
generalization is written into `firestore.rules:396` and is corrected in this PR.

So B1 moves legacy `members`/`positions`/`allies` docs missing either field, or holding a
non-bool `active`, from *client-editable* to *admin-SDK-only*. Owner-op 4 is therefore a
**blocking pre-deploy audit**, not a nice-to-know: the count must be known, and ideally zero,
before the rules ship. There is no rules-layer repair — the only fix is the console or the
admin SDK.

**What is genuinely safe** is the merge half: on an update `request.resource.data` is the
**merged** document, so a repository writing neither field still satisfies the check when the
stored doc is well-formed. `RoleRepository.update` is the live proof under the identical rule
(`rules.test.ts:2482-2495`).

**B2. The create arms are constrained to match.** `members` (`:287-293`), `positions`
(`:355-357`) and `allies` (`:547`) require nothing of the two fields, so they mint the exact
docs B1 then refuses to update. Each gains, mirroring the roles create arm (`:527-529`):

```
&& request.resource.data.get('active', false) == true
&& ('deletedAt' in request.resource.data)
&& request.resource.data.deletedAt == null
```

Every client creator already writes both. The test cost is larger than the first draft said,
and it is the interesting part of B2:

- **Three `assertSucceeds` go red** and must carry the fields: `rules.test.ts:608`, `:708`,
  `:717`.
- **Twelve `assertFails` become vacuous** — they would pass for the newly-added reason rather
  than the one they are named for: members `:613, :625, :634, :671, :676, :681, :690, :699,
  :740, :748, :756` and positions `:1799`. `:681` and `:699` are escalation guards, and
  `:613-624` states in a comment that it *isolates* the `publicProfile` create guard — a claim
  B2 falsifies unless the payload is repaired. All twelve carry `active`/`deletedAt` so they
  keep failing for their own reason. This repo has already cleaned up 14 tautological tests
  once; this is that class.
- One new test pins that the bare shape is now denied.

**B3. `project-board.ts` flips to the fail-closed direction.**

```ts
if (member.deletedAt != null || member.active !== true) return null;
```

B1 and B2 stop new malformed docs; **only B3 removes the existing public exposure**, so it
ships with them, not after. It also ends the split with `project-ally.ts`.

### Not in scope

The **coupling** half of `roleLifecycleSafe()` (`active == true ⟹ deletedAt == null`, plus
the `deletedAt == request.time` stamp) is not generalized. It would deny every subsequent
edit to an existing ghost doc (`active: true` + non-null `deletedAt`) — a shape that passes
all four zod schemas and therefore *is* listed and editable today — and it would turn three
`assertSucceeds` soft-delete tests red for using a client `new Date()`. Owed its own pass.

---

## C. One three-way resolution, in `packages/auth`

### Problem

The absent / live / inactive resolution is implemented twice — `resolveMemberPerms`
(`apps/beacon/src/claims-sync/resolve-member-perms.ts:46-64`) and `previewEffectivePerms`
(`apps/backstage/src/features/permissions/lib/effective-preview.ts:44-66`). Both already
import `resolveEffectivePerms` from `@luminova/auth/perms`, so the shared half has a home and
creates no new dependency edge (`auth → types` is the only edge; `types` references
`@luminova/auth` nowhere).

### Design

New file `packages/auth/src/built-in-perms.ts`, new export subpath
`@luminova/auth/built-in-perms` — the package has no root `"."` export, so an unlisted file
is unresolvable to esbuild and Vite alike. Relative imports carry explicit `.js`; beacon
typechecks this package through `NodeNext`.

```ts
export interface BuiltInRoleDoc {
  readonly permissions: readonly PermissionCode[];
  readonly builtInKey: Role;
  /** Precomputed liveness. NEVER the raw `active` field: a doc with `active: true` and a
   *  non-null `deletedAt` is a ghost — covered, contributing nothing. */
  readonly live: boolean;
}

export function resolveBuiltInPerms(input: {
  builtInRoleNames: readonly Role[];
  builtInDocs: readonly BuiltInRoleDoc[];
  customDocs: readonly Pick<RoleDefinition, "permissions">[];
  overrides?: { grant: PermissionCode[]; revoke: PermissionCode[] };
}): PermissionCode[];
```

Synchronous and pure over already-fetched docs. It must not sort or mutate its inputs —
beacon's graph is deep-frozen. The seed fallback moves **inside** it (that is what
`builtInRoleNames` is for), so `packages/auth` gains an import of `BUILT_IN_ROLE_PERMS` from
`@luminova/types/role-definition`.

**What does NOT move.** `isActiveRoleDoc` stays in beacon: it imports `DocumentData` from
`firebase-admin/firestore`, and `packages/auth` is consumed by the browser bundle and the
rules test suite. Liveness *derivation* stays per-side; only *consumption* is shared.
`PERMISSION_CAP` stays out — beacon fail-closes to `perms: []`, backstage blocks Save.

**One divergence is settled, in the tighter direction.** Beacon unions every live doc it is
handed without checking its `builtInKey` is one the member holds; backstage only collects
docs for a requested name. In production the beacon query is `where("builtInKey","in",keys)`
so they cannot differ — but the *functions* do, and the shared one picks backstage's: docs
whose key is not in `builtInRoleNames` are ignored. Tested directly, since no production path
produces it. No existing beacon test changes — all five docs in
`resolve-member-perms.test.ts:24-72` carry a key that is in `builtInRoleNames`.

**One divergence survives, documented not fixed.** A doc the zod schema rejects reads ABSENT
to backstage (`parseDocs` dropped it) and COVERED to beacon (which sanitizes per-element).
That is a difference between the two **ports**, not the two resolutions, so extracting the
resolution cannot close it.

### Callers and the adapters

`resolveMemberPerms` keeps its `deps` fetch orchestration and delegates; its
`LiveBuiltInRoleDoc` satisfies `BuiltInRoleDoc` with no cast. `previewEffectivePerms` is the
harder side — its `builtInDocs` is today a union of `{permissions}` (the snapshot fallback,
with no `builtInKey` and no `live`) and `RoleDefinition` (whose `builtInKey` is `Role | null`).
Its adapter maps to `{permissions: r.permissions, builtInKey: name, live: isLiveRole(r)}`,
castless because `name` is already `Role`, and keeps its `r.builtIn && r.builtInKey === name`
filter.

Both existing suites stay green unchanged — that is the refactor's acceptance criterion —
plus a new unit suite in `packages/auth`, which has none for this today.

**Cold-worktree caveat.** `turbo.json`'s `test` task has no `dependsOn: ["^build"]`, and
`packages/auth`'s `exports` map the `import` condition to `./dist/*.js`, so a bare
`pnpm test` on a fresh worktree cannot resolve the new subpath. Build the packages first, or
run `pnpm --filter <app> run ci` / `pnpm pr-tests`, which go through `turbo run ci`.

---

## D. `canCurateFeatured` — role name to permission

### Problem

`canCurateFeatured()` (`firestore.rules:176-178`) is `hasAnyRole(['Admin','ProjectManager'])`.
`computeMemberRoles` is pure over `{trustedGrants, hadScanner}` and reads no role doc, so a
**deactivated** `ProjectManager` keeps the name in its claim and keeps the authority. It gates
the only client-writable input to public-site content that is not a cargo assignment:
`featured` on `projects` and `programs`, which beacon projects to `showcase/{id}` and
spotlight renders on `/impacto` and the home band.

### The gate

```
function canCurateFeatured() {
  return hasAnyRole(['Admin']) || hasPerm('update:Showcase');
}
```

**`hasPerm`, not `canDo` — corrected from the first draft.** `canDo` would let `manage:all`
satisfy the gate, and `manage:all` is reachable as a *perm* without the Admin role: an
Admin-written custom role doc or a `permissionOverrides.grant` can carry it, since
`roleShapeValid()` only requires `permissions is list`. Such a principal already satisfies
`canDo('update','Project')` at `firestore.rules:208` — the **only** thing stopping them from
setting `featured` today is this role gate, which the file documents as deliberate at
`:200-202` ("Intentionally role-based, NOT perm-based"). Migrating to `canDo` would silently
delete that boundary; `nav-equivalence.test.ts:154-163` exists to assert a perm never unlocks
a role gate, and does not cover this route (`/initiatives` is `kind: "curationOnly"` and the
implication loop skips it — so a green suite is not coverage here).

`Admin` stays role-keyed. That is consistent with the rest of the file: `Admin` is `locked`
and undeactivatable, so name-keyed authority for it carries none of the staleness this change
exists to fix, and the alternative — adding `update:Showcase` to a role whose entire seeded
permission set is `["manage:all"]` — would misrepresent how Admin works. Only
`ProjectManager` moves, which is the whole point: deactivating that role now revokes
curation.

### Vocabulary — a new subject

Codes are a generated cross-product: 6 actions × 13 subjects = 78. No existing code fits.
`update:Project` / `manage:Project` already satisfy `canDo('update', subject)` at
`firestore.rules:208`, precisely the disjunct `featuredUpdateSafe()` layers on top of to
exclude — reusing one makes the gate a tautology and deletes the boundary `rules.test.ts:1968`
pins.

Add the subject **`"Showcase"`**: 78 → 84. A new *action* would cost 78 → 91 and put a column
across all subjects into the `/permisos` matrix. The subject is a slight misnomer — what is
gated is `featured` on `projects`/`programs`, not the beacon-owned `showcase` collection — and
the doc comment says so.

The other five `*:Showcase` codes gate nothing. That is the pre-existing condition of this
vocabulary, not a new defect: the matrix renders the full actions × subjects grid, so
`checkIn:Member` and dozens like it are already assignable and inert. Notably `manage:Showcase`
is inert **because** the gate uses exact `hasPerm` — there is no second, undocumented path to
curation. A test pins that.

Blast radius: `SUBJECT_LABELS` (`permission-matrix.ts:25-40`) is
`Record<Exclude<Subject,"all"|"Role">, string>` and fails to compile until the label is added.
`ACTION_LABELS` is untouched. `MATRIX_SUBJECTS` and `ASSIGNABLE_CODES` are derived, so the
code appears in `/permisos` automatically. Cap headroom is ample: largest built-in holds 9,
the union of all nine holds 20, cap is 30.

### Seed

`ProjectManager` gains `update:Showcase` in `BUILT_IN_ROLE_PERMS`
(`packages/types/src/role-definition.ts:45-51`) **and** in the hand-mirror
`tools/scripts/lib/role-seed.mjs:28-34` — `role-definition.mirror.test.ts:16-18` fails
otherwise. `Admin` needs no edit. No other role can curate today, so no other role gains it.

### The deploy landmine

`BUILT_IN_ROLE_PERMS` is a seed **snapshot**, not the live source: once a role doc exists its
stored `permissions` win, and `seedBuiltInRoles` is create-only. Editing the constant mints
nothing in production. If the rules ship first, every current `ProjectManager` loses curation.

**Order: deploy beacon → run `reseedBuiltInRolePerms` → verify the CLAIM → deploy rules →
deploy hosting.** The new perm is inert until the rules read it, so granting it early is safe
and the reverse is not.

`reseedBuiltInRolePerms` is update-only and skips `missing`, `locked`, `not-built-in` and
**`inactive`** docs (`recompute-claims.ts:212-228`). A *missing* `roles/ProjectManager` is
harmless — the `BUILT_IN_ROLE_PERMS` fallback already carries the code. A *locked* or
*inactive* one silently drops PM curation, which is why the verification step is the claim and
not the doc.

### Residual introduced by D

Curation now sits behind `PERMISSION_CAP`'s fail-closed path: a member over 30 effective perms
gets `perms: []` written while keeping `roles: ['ProjectManager']` (`sync.ts:111-122`). Today
they still curate via the role gate; after D they cannot. One more surface behind the cap.

### Client mirror

`canFeatureInitiatives` (`use-can.ts:54`) moves from `hasAnyRole(claims, ["Admin","ProjectManager"])`
to `isAdmin || <ability check for update:Showcase>`, mirroring the rule's two disjuncts
exactly. Its two consumers (`initiatives-page.tsx:32`, `initiative-detail-page.tsx:60`) are
unchanged. `isAdmin` and `canAssignPowerGrants` in the same file stay role checks — they guard
the claims-mint trust anchor.

### Tests

**Sixteen** `rules.test.ts` featured tests, not eight: `:1320, 1323, 1328, 1333, 1338, 1343,
1348, 1353` and `:1959, 1968, 1977, 1986, 1995, 2003, 2015, 2024`. They keep their names and
intent; the `as(...)` principals gain the code where they are meant to pass. New:

- BLOCKING: a `ProjectManager` whose role doc is DEACTIVATED cannot set `featured` — the claim
  keeps the name, the perms do not carry the code. The whole point of D.
- BLOCKING: `manage:all` as a **perm**, with no Admin role, cannot set `featured` — pins the
  `hasPerm`-not-`canDo` decision and preserves the `:200-202` boundary
- BLOCKING: `manage:Showcase` alone cannot set `featured` — pins that the inert codes are inert
- a custom role holding `update:Showcase` and nothing else can curate

`use-can.test.ts:41-45` needs a **fixture rewrite**, not a relabel: its cases pass
`{ roles: ["ProjectManager"] }` with no `perms`, and `buildAbility` reads `claims.perms ?? []`,
so all three assertions go false until the fixtures carry `perms: ["update:Showcase"]`.
`initiative-form.tsx`'s `canFeature &&` render branch has no test today — one is added.

---

## Owner-ops

1. **Hand cargo assignment to an org-chart editor (optional, data-only).** In `/permisos`,
   create a **custom** role carrying `update:Position` and assign it. **Do not add the perm to
   the `ExecutiveCommittee` built-in** — `reseedBuiltInRolePerms` rewrites built-in docs back
   to the seed snapshot and would strip it without warning. Understand what it confers: the
   holder may assign and clear **grant-free** cargos and comisiones (never a power cargo, on
   either side of a swap), may edit the positions catalog except `grants` and `category`, and
   — because grant-free JDL direcciones are board cargos — **may publish a member, including
   themselves, to the public Directiva**.
2. **Before deploying D's rules:** run `reseedBuiltInRolePerms`, then run `recomputeAllClaims`,
   then confirm a live `ProjectManager`'s **ID-token claim** carries `update:Showcase`. The
   reseed's `onRoleWritten` fan-out is unbounded and `retry: false`, so it can strand members;
   checking the role doc is not sufficient.
3. **Outstanding from PR 2, still open:** in `/positions`, ADD `Secretary` to the Secretario
   cargo's grants, THEN remove `Admin`. In that order, or ally management goes dark.
4. **BLOCKING pre-deploy audit for B.** Count `members`, `positions` and `allies` docs whose
   `active` is missing or not a bool, or which lack `deletedAt`. Each becomes admin-SDK-only
   to edit the moment B1 ships, with no UI affordance to repair it — and unlike the first
   draft's claim, they are editable **today**. Repair them from the console before the rules
   deploy, or accept a known, counted set.

## Deploy order

**beacon → reseed + recomputeAllClaims → verify claim → rules → hosting.** B3 and D's seed
live in beacon; D's rules depend on the reseed; A and B are rules-only; the mirrors are
hosting.

## Review corrections

Recorded because each falsified something this document previously asserted:

1. **CEL `||` absorbs errors**, so B1's "denies nothing legitimate" was wrong — the `in` checks
   are a genuine new denial on legacy docs. Owner-op 4 upgraded to blocking.
   `firestore.rules:396` carries the same wrong generalization and is corrected here.
2. **`planRolePermReseed` strips a `/permisos` grant on a built-in role**, so owner-op 1 must
   use a custom role — the two owner-ops previously contradicted each other.
3. **`canDo('update','Showcase')` would hand curation to a `manage:all`-perm principal**, the
   exact boundary `firestore.rules:200-202` declares deliberate. Changed to `hasPerm`.
4. **The new lane is a public publication authority** via grant-free JDL board cargos.
   Accepted deliberately, stated in owner-op 1, pinned by a test, and narrowed by
   `unchanged('category')` on the catalog arm.
5. **B2's test cost is 3 reds + 12 vacuous**, not one red.
6. **D's test cost is 16 rules tests**, not eight, plus a `use-can` fixture rewrite.
7. **`manage:Position` opens the positions editor too** (CASL `manage` satisfies `update`), so
   two `member-edit-gate` assertions invert rather than one.

## Residuals

- The coupling half of `roleLifecycleSafe()` on the four lanes (B, Not in scope).
- The term-rollover window in `currentCargoGrantsEmpty()` (A, Residual).
- The port-level divergence in C: a zod-rejected doc reads ABSENT to backstage, COVERED to beacon.
- `siteConfig` write is still `hasAnyRole(['Admin'])` — same class as D, smaller blast radius.
- Refresh-token revocation: a revoked perm survives in a long-lived tab until reload.
- `onRoleWritten`'s unbounded, no-retry fan-out.
