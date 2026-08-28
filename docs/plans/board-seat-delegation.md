# Implementation Plan — Board-seat + member-login delegation

Branch: `feat/board-seat-delegation`

> **SUPERSEDED — point-in-time artifact, not current guidance.** This plan was written before
> the design went through two adversarial reviews and 15 commits, and it was never updated as
> the design changed under it. `docs/specs/board-seat-delegation.md` is the authority on what
> actually shipped. Most importantly: **section 0b's G2 guard, below, describes a form of the
> self-assignment fix that was proposed, found to be wrong, and REJECTED** — it would have
> stripped the seeded bootstrap president's `Admin` claim on their very next member write, a
> near production outage. Do not implement G2 as written. See the correction inline at G2 and
> the spec's "Two earlier forms of this guard were wrong" for the full account. Kept in the repo
> as the commit-by-commit record of how the design evolved (per the "Fact-check corrections"
> table near the end, this document corrects itself in several other places too) — read it as
> history, not as a spec to implement from.

## 0. Accepted decision

The chapter owner has accepted that `update:BoardSeat` is a **claims-minting delegation**: a
delegate may seat a member on a cargo whose `grants` include `Admin`, and beacon's trust gate
will mint that claim. Deliberate; no guard is added against *that*. The delegation is meant to
be granted temporarily and revoked.

The acceptance is explicitly premised on **revocability**. Three guards below exist to make that
premise true; without them it is false. They are not a narrowing of the accepted decision — a
delegate can still seat any vacant cargo, including `Presidente`.

## 0b. Security guards (added after adversarial review — G1/G2/G3)

> **SUPERSEDED section.** G1 and G2 below describe the FIRST proposed shape of each guard, from
> before implementation. Neither is what shipped — G1's shipped guard is narrower, and G2's
> proposed fix was rejected outright (see the correction under G2). Section 0b also predates
> three guards that were added later, in response: the power-seat guard in `provisionMember`,
> fail-closed handling for a malformed `grants`/`positions` shape, and a narrowed `createUser`
> catch — listed under "Guards added after this section was written", below. Treat this whole
> section as the audit trail, and `docs/specs/board-seat-delegation.md` as the design authority.

Two independent reviews found three defects, all confirmed by reading code. Each guard below
removes a capability the owner did **not** ask for, and none removes one they did.

### G1 — `provisionMemberLogin`: a non-Admin caller may only mint a NEW Auth account

`provision-member-login.ts:82-114`. The relink refusal at `:85` is guarded by
`linkedUid !== null`, so it does not run for a member doc with no `uid`. Rules never constrain
`members.email` (`firestore.rules:428-435` pins `totalPoints`/`uid`/`publicProfile`/`name`/
`roleIds`/`positions`, not `email`), and no uniqueness check exists. So a
`create:Member` + `create:MemberLogin` holder could create `members/evil` carrying a sitting
Admin's email, call the callable, and have it (a) adopt the Admin's Auth account, (b) strip its
claims via `adoptedClaims` at `:109`, (c) `linkUid` the Admin's uid onto their own doc through
the admin SDK at `:111`, and (d) return a **password-reset link for the Admin's email** at
`:112-114`. Full account takeover, unrelated to board seating.

**Guard, as first proposed here — NARROWER in the shipped code, see correction:** thread the
caller's privilege into `provisionMember`. For a non-Admin caller require
`user === null || user.uid === linkedUid` **before** `:97` — a delegate may create a brand-new
Auth account or re-provision an already-linked one, never adopt a pre-existing account. Costs
the delegate nothing: a genuinely new member has no existing account.

**Correction — what shipped is stricter than this.** The resend/re-provision half of this
proposal was itself found to be a hole and closed before merge:
`generatePasswordResetLink` (`passwordResetLink` in the `ProvisionDeps` port) returns the oobCode
URL **to the caller**, categorically unlike `sendPasswordResetEmail`, which delivers the secret
to the mailbox owner. A delegate permitted to "re-provision an already-linked" member could name
any member's id — including an Admin's — and receive a live reset link for that address. The
shipped guard in `provisionMember` (`apps/beacon/src/provision-member-login.ts:206`) is therefore:

```ts
if (!callerHoldsAdminRole && (user !== null || linkedUid !== null)) {
  throw new HttpsError("permission-denied", /* ... */);
}
```

A non-Admin caller gets exactly one shape — mint a brand-new Auth account for a member that has
**neither** an existing Auth user for its email **nor** a stored `uid`. Resend, adoption, and the
deleted-account self-heal are all Admin-only; there is no re-provision path left for a delegate at
all. See `docs/specs/board-seat-delegation.md` § "`create:MemberLogin` — what is actually
privileged" for the full account, including the power-seat guard this section does not mention
(added later — see below).

Note also: the invite **email** is not the privileged part. `requestPasswordReset`
(`apps/backstage/src/lib/auth/request-password-reset.ts`) is a plain client-side
`sendPasswordResetEmail` any signed-in user can already call. The callable's privilege is
account creation/adoption + uid linking + claim writing.

### G2 — the trust gate must be non-reflexive on self-assignment — proposed fix REJECTED, do not implement as written

`sync.ts:69` + `compute-roles.ts:8-12` (pre-implementation line refs; current shipped location is
`resolveTrustedGrants` in `apps/beacon/src/claims-sync/sync.ts:97-135`). A delegate self-seats
`Presidente` in one write on the positions-only lane; beacon mints `roles: ["Admin","Member"]`.
Revoking `update:BoardSeat` then re-fires `onMemberWritten`, the gate reads their **live** claims,
finds the `Admin` role the cargo just minted, and re-honors the grants. The claim satisfies the
gate that minted it, so the delegation is permanent. `recomputeAllClaims` runs the same code and
does not break the loop. This diagnosis stands; only the fix below was wrong.

**Guard as first proposed here — REJECTED, DO NOT RE-PROPOSE:** when `assignedBy === member.uid`,
trust **only** `assigner.perms.includes("update:BoardSeat")`, never `assigner.roles.includes("Admin")`.

**Why this is wrong, and is the exact inverse of what shipped:** the seeded bootstrap president
self-stamps `assignedBy` with their own uid (`tools/scripts/lib/seed-president.mjs`), and an
Admin's perms are `manage:all` — never the exact `update:BoardSeat` code. Keying the
self-assignment trust check on the perm, as proposed above, means the sitting president's own
`Admin` claim would be **stripped on their next member write**. Confirmed against the live
production member doc before this shipped; a regression test pins it. This form also does not
close the two-write puppet loop (a delegate seats a SECOND member, not themselves, on
`Presidente` — not a self-assignment, so it is still trusted) — see
`docs/specs/board-seat-delegation.md` § "Two earlier forms of this guard were wrong" for both
failure modes in full.

**What shipped instead:** self-assignment is honored ONLY for an assigner holding the Admin
**role** — the opposite disjunct from the one proposed above — and the same rule extends to any
cargo whose `grants` include `Admin`, self-assigned or not:

```ts
const assignerIsAdmin = assigner.roles.includes("Admin");
const selfAssigned = assignedBy === memberUid;
const trusted =
  position.grants.includes("Admin") || selfAssigned
    ? assignerIsAdmin
    : assignerIsAdmin || assigner.perms.includes("update:BoardSeat");
```

An Admin seating *someone else* on a non-Admin power cargo is unaffected either way; an Admin
self-seating still works because they hold the Admin role. Revoking `update:BoardSeat` from a
delegate is then real for everything they *can* confer, because no cargo-derived Admin can ever
originate from a delegate in the first place — there is no loop to close.

Test: assigner === target, `roles:["Admin"]`, `perms:[]` → grants **still honored** (assigner is
Admin) — the inverse of what the rejected proposal above would have asserted.

### G3 — `currentCargoGrantsEmpty()` stays Admin-only

`computeMemberRoles` derives the `roles` claim **exclusively** from cargo grants; directly
assigned `roleIds` feed `perms`, never `roles`. So bypassing `currentCargoGrantsEmpty()` lets a
delegate clear every Admin's cargo and strip them all. After the last one there is no Admin:
`setUserRoles` is `requireAdmin`, `roles/*` and `permissionOverrides` writes are Admin-only.
Unrecoverable outside the Firebase console.

**Guard:** substitute `boardSeatDelegate()` only on the NEW-side conjunct. `positionsAssignmentSafe()`
becomes:

```
(boardSeatDelegate() || cargoAssignableByNonAdmin())
  && (hasAnyRole(['Admin']) || currentCargoGrantsEmpty())
```

A delegate seats any **vacant** cargo but cannot displace a sitting power-cargo holder. Hand-over
stays an Admin action. `createPositionsSafe()` has no old side, so it takes the plain
substitution.

If the owner later wants de-elevation delegated too, that is a separate code with its own
anti-lockout guard — not this one.

### Guards added after this section was written

Later commits on this branch (`5f9408e`, `e02dbf1`, `d7cd564`, `2c328f5`, `58266d3`) found and
closed three more gaps this section does not mention. Confirmed against the shipped code, not
restated from memory:

- **The power-seat guard in `provisionMember`.** G1 above stops a delegate from re-provisioning
  or adopting an ALREADY-linked account, but says nothing about an unlinked member who is already
  granted or already power-seated — "unprovisioned" is not "enrolled by this delegate". Without a
  further check, `provisionMemberLogin` would link a fresh Auth uid onto such a member, fire
  `onMemberWritten`, and `resolveTrustedGrants` would read the *stored* `assignedBy` (a genuine
  Admin) and mint the grants onto the account the delegate's call just created — a clean
  escalation the delegate never had to forge. The shipped guard
  (`apps/beacon/src/provision-member-login.ts:213-251`) checks both claims-mint sources
  `syncMemberClaims` reads: `hasDirectGrants()` (`:83-99`, `roleIds`/`permissionOverrides`) and a
  per-term cargo read via `readCargoIds()` (`:101-139`, every term in `positions`, not just the
  current one — a future-term slate is invisible to claims-sync today but not to this guard).
- **Fail-closed handling for a malformed `grants` or `positions` shape.** `readCargoIds()`
  (`:119-139`) yields `""` — not skip — for a non-object term, a non-string `cargoId`, or one
  `isSafeDocId` rejects; the caller then refuses on `grants === null`, so a shape it cannot parse
  is treated as power-seated, never as "no cargo". `hasDirectGrants()` (`:83-99`) is symmetric for
  `roleIds` / `permissionOverrides`: a present-but-unparseable value reads as granted, and only a
  genuinely absent/null value reads as ungranted.
- **The narrowed `createUser` catch.** `apps/beacon/src/provision-deps.ts:25-29` swallows exactly
  `auth/email-already-exists` (a benign race with a concurrent create) and rethrows everything
  else — it does not swallow arbitrary Auth errors into a silent fallback.

## The two codes

| Subject | Spanish label | Live code | Grants |
|---|---|---|---|
| `BoardSeat` | "Asientos de directiva" | `update:BoardSeat` | assign/clear ANY cargo — CEL category and power-granting alike — on the member CREATE and UPDATE lanes |
| `MemberLogin` | "Acceso de miembros" | `create:MemberLogin` | run `provisionMemberLogin`: link a Firebase Auth user and return the password-reset action link (the "Enviar acceso" invite email). Cargo-agnostic — applies to every new member, board seat or not. |

Independent by construction: an Admin can grant emailing without board seating and vice versa.

## Corrections to the original brief

### C1 (critical). `canAssignPowerGrants` also governs the `/positions` CATALOG

Five consumers, one of which is the catalog:

- `member-invite-drawer.tsx:180` -> `MemberForm allowPowerGrants` (create lane) — in scope
- `member-drawer.tsx:153` -> `MemberForm allowPowerGrants` (update lane) — in scope
- `member-profile-page.tsx:148` -> `MemberForm allowPowerGrants` — in scope
- `member-profile-page.tsx:176` -> `MemberPositionsForm allowPowerGrants` — in scope
- `positions-page.tsx:178` -> `PositionForm canEditGrants` — **OUT of scope**

`PositionForm.canEditGrants` unlocks the `grants` editor, the `category` select and the
board-cargo `title`/`titleFemale` fields (`position-form.tsx:88,134,157,179`) — exactly the
`/positions` arms that stay Admin-only. Widening the shared flag would render that editor for a
delegate whose write `firestore.rules` then rejects: the render-then-403 shape `use-can.ts`'s own
`canFeatureInitiatives` comment exists to prevent.

**Resolution:** split the flag.

- `canAssignBoardSeat` = `hasAnyRole(["Admin"]) || hasPerm("update:BoardSeat")` — the four member-lane call sites.
- `canEditCargoCatalog` = `hasAnyRole(["Admin"])` — `positions-page.tsx` only.
- `canAssignPowerGrants` is deleted. Both replacements are `Can` members, so every call site is compiler-guided.

### C2. `PERMISSION_CAP` and `ALL_PERMISSION_CODES` — no test breaks

- `SUBJECTS` 14 -> 16, `ALL_PERMISSION_CODES` 84 -> 96. `permission.test.ts:34` asserts
  `ACTIONS.length * SUBJECTS.length`, self-adjusting.
- The 1000-byte claim test (`permission.test.ts:38`) keys on the longest code, still
  `checkIn:MemberPoints` / `checkIn:Notification` (20 chars). `checkIn:MemberLogin` is 19,
  `checkIn:BoardSeat` is 17. Worst case stays ~855 B. `PERMISSION_CAP` does not move.
- Product consequence worth one spec line: two more codes compete for the same 30-slot effective-perm
  budget, and a member breaching the cap gets `perms: []` fail-closed (`sync.ts:106-118`) — silently
  removing their `update:BoardSeat`.
- `sync.test.ts:580` `distinctCodes(n)` walks `ACTIONS x SUBJECTS` in order; adding subjects changes
  which codes it picks, not their validity. No change.

### C3. Two permission surfaces; neither needs a component change

- `MATRIX_SUBJECTS` is a runtime `SUBJECTS.filter(...)` (`permission-matrix.ts:6`). Both new subjects
  appear as checkbox rows in the `/permisos` role editor grid automatically. The only compiler-guided
  edit is `SUBJECT_LABELS`.
- The per-member surface — `member-roles-panel.tsx`, Admin-only, on `/members/$memberId`, a MultiSelect
  of chips — derives options from `ALL_PERMISSION_CODES` + `permissionLabel()` (`:17-21`), so it picks
  the codes up for free. Without the `SUBJECT_LABELS` entries the chip would read "Crear MemberLogin"
  (raw-subject fallback at `permission-matrix.ts:46`).

### C4. `firestore.rules`: exactly TWO substitution sites

`cargoAssignableByNonAdmin()` and `currentCargoGrantsEmpty()` contain no role check of their own —
they are pure cargo predicates.

| Function | Current | After |
|---|---|---|
| `positionsAssignmentSafe()` | `hasAnyRole(['Admin']) \|\| (cargoAssignableByNonAdmin() && currentCargoGrantsEmpty())` | `boardSeatDelegate() \|\| (...unchanged...)` |
| `createPositionsSafe()` | `assignedBySelf() && (hasAnyRole(['Admin']) \|\| cargoAssignableByNonAdmin())` | `assignedBySelf() && (boardSeatDelegate() \|\| ...)` |

Two further facts:

- **`update:BoardSeat` on its own opens nothing.** Both functions are conjuncts inside an arm whose
  entry condition is `canDo('update','Member')`, `canDo('update','Position') && hasOnly(['positions'])`,
  or `canDo('create','Member')`. Rules tests must use a principal holding one of those, or they pass
  for the wrong reason.
- **The delegate also gains de-elevation.** Bypassing `currentCargoGrantsEmpty()` means a delegate can
  clear or replace an existing power cargo, not just assign one. Say it in the rules comment.

Explicitly UNCHANGED (Admin-role-only): the `/positions` create arm's
`hasAnyRole(['Admin']) || (grants == [] && !boardSurfacingCategory())`; the `/positions` update arm's
`hasAnyRole(['Admin']) || (unchanged('grants') && unchanged('category') && ...)`;
`createPermissionAssignmentSafe()` / `updatePermissionAssignmentSafe()`; the members Admin takedown arm.

### C5. `permsFromClaims` exists but is not reusable from `callable-auth.ts`

`firestore-deps.ts:16` defines it module-local, not exported, and its contract differs: it validates
through `isValidPermissionCode` and returns `PermissionCode[] | undefined`, where `undefined` means "no
`perms` key" — which `getExistingClaims` uses for its claim diff. Importing it would pull
`firebase-admin/firestore`, `chunk`, `role-doc` and `resolve-member-perms` into the callable trust
boundary for a boolean membership test.

Instead: extract the genuinely shared three lines — `stringArrayClaim(request, key)` — so `callerRoles`
and the new perms reader share one implementation. Satisfies guardrail #1 for the logic actually
duplicated, without coupling the trust boundary to the claims-sync Firestore port.

### C6. `member-drawer.tsx` has NO provision affordance

Complete list of `isAdmin`-gated provision affordances:

| File | Line | Gate today | Move to |
|---|---|---|---|
| `member-invite-drawer.tsx` | 41, 43, 51, 56, 184 | `isAdmin` | `canProvisionLogin` |
| `member-row-menu.tsx` | 50 | `<ActionGate role={["Admin"]}>` | `<ActionGate when={canProvisionLogin}>` |
| `member-profile-page.tsx` | 132 | `<ActionGate role={["Admin"]}>` | `<ActionGate when={canProvisionLogin}>` |

`members-page.tsx` owns the mutation and passes `onProvision` down unconditionally — no change.
`ActionGate` needs no change: `role` and `when` are ANDed and `role` is optional (`action-gate.tsx:21`).

### C7. Only ONE test file implements `ClaimsSyncDeps`

`apps/beacon/src/claims-sync/sync.test.ts` — the `fakeDeps` factory (`:43-85`), the `spied`
spread-override (`:154-160`), and the standalone rejecting deps (`:536-547`).

### C8. `assignable-cargo.ts` — no change needed

Fully parameterized on `allowPowerGrants` (`:41-115`). Widening the source of that boolean is the
entire change. Its doc comment needs one sentence ("Admin, or an `update:BoardSeat` delegate") so the
file stops claiming the branch is Admin-only.

### C9. `BUILT_IN_ROLE_PERMS` — no change needed

Neither code is seeded onto any built-in role. `role-seed.mjs` mirrors only `BUILT_IN_ROLE_PERMS` /
`ROLE_LABELS` / `ROLE_DESCRIPTIONS`, cross-checked by `role-definition.mirror.test.ts`. That table is
untouched. `seed-contract.test.ts` never enumerates `SUBJECTS`.

---

## Slice 1 — Vocabulary, labels, spec

1. `docs/specs/board-seat-delegation.md` (new) — the two codes; the accepted escalation decision; the
   "`update:BoardSeat` alone opens nothing" dependency; the "revoking de-elevates on next write" note;
   the out-of-scope list from C4; the cap note from C2.
2. `packages/types/src/permission.ts` — add `"BoardSeat"` and `"MemberLogin"` to `SUBJECTS`, before
   `"all"`. Each gets a comment in the shape of the existing `Showcase` block: name the ONE live code,
   state the gate is an exact `hasPerm`, state the sibling codes are inert *because* the gate is exact.
3. `packages/types/src/permission.test.ts` — subject in `SUBJECTS`; live code validates; inert siblings
   validate too (the matrix renders the full grid and the role editor's write validation would reject an
   assignable-but-unvalidatable code).
4. `apps/backstage/src/features/permissions/lib/permission-matrix.ts` — `SUBJECT_LABELS` gains
   `BoardSeat: "Asientos de directiva"` and `MemberLogin: "Acceso de miembros"`. No `MATRIX_SUBJECTS`
   edit (C3).

Verify: `pnpm --filter @luminova/types run build && pnpm --filter @luminova/auth run build`,
`pnpm --filter @luminova/types run ci`, `pnpm --filter backstage run typecheck`.

Commit: `feat(types): add BoardSeat and MemberLogin permission subjects`

## Slice 2 — `firestore.rules` + rules tests

1. `firestore.rules` — add above `cargoAssignableByNonAdmin()` (define-before-use is this file's
   convention at that point):

   ```
   function boardSeatDelegate() {
     return hasAnyRole(['Admin']) || hasPerm('update:BoardSeat');
   }
   ```

   Comment in the shape of `canCurateFeatured()`'s: Admin by ROLE (locked, undeactivatable); everyone
   else by exact PERM so revoking the code revokes the authority, which a surviving role NAME would not;
   `hasPerm` not `canDo` so `manage:all` cannot satisfy it and the sibling codes stay inert; and the
   accepted decision that a delegate may seat a power-granting cargo, with beacon's trust gate widened
   to match.

   Substitute at the two C4 sites. Extend the existing comments rather than replacing: the non-Admin
   branch is unchanged, so a non-delegate is still held to
   `cargoAssignableByNonAdmin() && currentCargoGrantsEmpty()` and the asymmetric grant-free-CEL takedown
   survives; a delegate bypasses both conjuncts and therefore also gains replace/clear of a power cargo.

   Leave the `/positions` arms, the permission-assignment arms and the takedown arm alone.

2. `tests/firestore-rules/rules.test.ts` — module-scoped principals beside `ORG_CHART`/`orgChart`:

   ```ts
   const seatDelegate = () => as(SEAT_DELEGATE, [], ["update:Position", "update:BoardSeat"]);
   const plainDelegate = () => as("seatonly-uid", [], ["update:BoardSeat"]);
   ```

   `update:Position` is load-bearing — without it the delegate never reaches an arm and every ALLOW
   below would pass for the wrong reason.

   New fixtures in the once-only `beforeAll` seed: `members/m_delegate`, `members/m_delegate_power`
   (seeded holding `pos1` in the current term), `members/m_delegate_cel`.

   Cases in `describe("firestore.rules — member positions assignment")`, before the terminal
   "allows Admin to assign a power-conferring cargo" test:
   - delegate assigns a grant-free CEL cargo (`pos_cel_free`) to `m_delegate_cel`, self-stamped — the
     case `orgChart()` is denied twelve lines above. Pair them in the comment.
   - delegate assigns a power-granting cargo (`pos1`) to `m_delegate`, self-stamped.
   - delegate replaces the power cargo on `m_delegate_power` with `pos_soft` — the
     `currentCargoGrantsEmpty()` bypass, i.e. de-elevation authority.
   - `plainDelegate()` (has `update:BoardSeat`, lacks `update:Position`/`update:Member`) is denied any
     positions write. Non-vacuity pin for the whole feature.
   - delegate denied a forged `assignedBy` — `assignedBySelf()` is outside the substituted disjunction.
   - delegate denied a non-current-term write — `positionsDelta().hasOnly([currentTermKey()])`.
   - delegate denied any ride-along non-positions field on the `hasOnly(['positions'])` lane.
   - regression pin: `orgChart()` still denied `pos1` and `pos_cel_free`, still allowed the grant-free
     JDL `pos_soft`. Extend the existing comments to name the new disjunct.
   - takedown pin: a non-delegate `update:Position` holder may still CLEAR a member off a grant-free CEL
     seat. **No test today** — `pos_cel_free` appears only in assign-side assertions. Most important
     regression guard in the slice, because the delegate bypass touches the same expression.

   Create lane in `describe("firestore.rules — members")`: a delegate holding
   `create:Member` + `update:BoardSeat` may create a member born on `pos_cel_free` and on `pos1`,
   self-stamped; the same principal without `update:BoardSeat` is still denied both. Mirrors the
   existing `new_cel_free` / `new_cel_admin` pair.

   Catalog-UNCHANGED in `describe("firestore.rules — positions")`: a catalog delegate holding
   `["create:Position","update:Position","update:BoardSeat"]` is still denied minting a CEL cargo and a
   JDL dirección, still denied setting `grants`, still denied changing `category`, still denied
   retitling a board cargo. Without the catalog codes these pass vacuously.

Verify: `pnpm --filter @luminova/firestore-rules-tests run ci`

Commit: `feat(rules): delegate board-seat assignment via update:BoardSeat`

## Slice 3 — beacon claims-sync trust gate

**Port shape.** Rename `getUserRoles(uid): Promise<Role[]>` to
`getAssignerClaims(uid): Promise<{ roles: Role[]; perms: PermissionCode[] }>`.

Rejected alternatives:

- *A second method `getUserPerms(uid)`* — two calls to answer one question is two chances for a future
  edit to consult one and not the other, precisely where that must not happen (guardrail #1). Free in
  production (`loadUser` memo) but not in the fakes, which would need two hand-consistent maps.
- *Reuse `getExistingClaims(uid)` for the assigner* — structurally smallest, but it would blunt the
  sharpest test in `sync.test.ts`: the `spied` case at `:154` asserts `assignerLookups).toEqual([])` to
  prove `resolveTrustedGrants` short-circuits on `grants.length === 0` **before** consulting the
  assigner. Merged, the same spy would also record the target's own claim read, degrading the assertion
  to a uid-filtering heuristic. Also `getExistingClaims` returns `perms?:` optional by design (absence
  vs. empty is meaningful for its diff) — the wrong contract for a membership test.

1. `apps/beacon/src/claims-sync/sync.ts` — port change; `resolveTrustedGrants` keeps the `isSafeDocId`
   screen and the `grants.length === 0` early return exactly as they are, then:

   ```ts
   const assigner = assignedBy ? await deps.getAssignerClaims(assignedBy) : null;
   const trusted =
     assigner !== null &&
     (assigner.roles.includes("Admin") || assigner.perms.includes("update:BoardSeat"));
   return trusted ? [...new Set(position.grants)] : [];
   ```

   **This snippet is superseded — it is missing the self-assignment / Admin-granting-cargo branch
   that G2 (above) required and that shipped.** The real trust computation, unchanged since,
   reads (`apps/beacon/src/claims-sync/sync.ts:126-134`):

   ```ts
   const assignerIsAdmin = assigner.roles.includes("Admin");
   const selfAssigned = assignedBy === memberUid;
   const trusted =
     position.grants.includes("Admin") || selfAssigned
       ? assignerIsAdmin
       : assignerIsAdmin || assigner.perms.includes("update:BoardSeat");
   return trusted ? [...new Set(position.grants)] : [];
   ```

   Extend the doc comment: name `update:BoardSeat` as the second trust source; state why (a delegate
   stamps their own uid into `assignedBy` via `assignedBySelf()`, so without this the seat publishes on
   the public Directiva and mints nothing — half-working, not safe); state the live-claims
   re-evaluation now also covers perm revocation; cross-reference `boardSeatDelegate()` in
   `firestore.rules`. One line on the cap interaction (C2). State the self-assignment / Admin-grant
   exception too (G2) — it is not a detail, it is the guard the whole delegation rests on.

2. `apps/beacon/src/claims-sync/firestore-deps.ts` — rename the impl at `:287`, returning both, reusing
   the two module-local readers already there. No new read: `loadUser` is the same per-instance memo.

3. `apps/beacon/src/claims-sync/sync.test.ts` — update the three port literals (C7). `fakeDeps` gains a
   `userPerms` option map. New cases:
   - honors power grants when the assigner holds `update:BoardSeat` and NOT the Admin role — mirror of
     the existing "honors power grants when assignedBy is Admin" at `:109`.
   - a `manage:all` perm holder who is neither Admin-by-role nor an `update:BoardSeat` holder does NOT
     satisfy the gate — the exact-code property, asserted server-side too.
   - revocation — same fixture with the assigner's perms emptied; the target recomputes down to a plain
     `Member` claim.
   - the existing `:129` positive-and-inert spy case: update the override, keep both assertions verbatim.

Verify: `pnpm --filter beacon exec vitest run src/claims-sync/sync.test.ts`, then
`pnpm --filter beacon run ci`.

Commit: `feat(beacon): honor cargo grants from an update:BoardSeat assigner`

## Slice 4 — beacon callable auth

1. `apps/beacon/src/callable-auth.ts` — extract the shared reader (C5), then:

   ```ts
   export function requireAdminOrPerm(request: CallableRequest, code: PermissionCode): void {
     if (!request.auth) throw new HttpsError("unauthenticated", "sign-in required");
     if (callerRoles(request).includes("Admin")) return;
     if (stringArrayClaim(request, "perms").includes(code)) return;
     throw new HttpsError("permission-denied", `Admin role or ${code} required`);
   }
   ```

   Comment: exact-code match mirroring the rules' `hasPerm()` and `use-can`'s `hasPerm` — deliberately
   NOT a `canDo`-style expansion, so `manage:all` does not satisfy it. `requireAdmin` keeps its exact
   current behaviour and message.

2. `apps/beacon/src/callable-auth.test.ts` (new) — this trust boundary is unasserted today.
   `requireAdmin`: unauthenticated / non-Admin / Admin. `requireAdminOrPerm`: unauthenticated; Admin with
   no `perms` claim at all; `{roles:["Member"], perms:["create:MemberLogin"]}` passes;
   `{roles:["Member"], perms:["manage:all"]}` **throws** (wildcard-must-not-satisfy);
   `{roles:["Member"], perms:["update:BoardSeat"]}` asked for `create:MemberLogin` throws (independence);
   a non-array `perms` claim throws (fail-closed on a malformed token).

3. `apps/beacon/src/provision-member-login.ts` — `requireAdmin(request)` ->
   `requireAdminOrPerm(request, "create:MemberLogin")` at `:118`. Comment: the callable links an Auth
   account and returns a password-reset action link, delegable per the owner decision; the `adoptedClaims`
   de-elevation and the different-uid refusal are unchanged and still bind on every caller.

   Do not touch `seed-roles.ts`, `recompute-claims.ts:22,65,267`, `set-user-roles.ts:86`.

Verify: `pnpm --filter beacon run ci`

Commit: `feat(beacon): allow create:MemberLogin to call provisionMemberLogin`

## Slice 5 — backstage gate flags (the C1 split)

1. `apps/backstage/src/lib/authz/use-can.ts` — delete `canAssignPowerGrants`; add
   `canAssignBoardSeat`, `canEditCargoCatalog`, `canProvisionLogin` with doc comments. Both perm-based
   flags use `hasPerm` from `@luminova/auth/roles`, never `abilityAllows` — one line referencing the
   existing `canFeatureInitiatives` comment. `canEditCargoCatalog`'s comment must state that this is what
   the seat delegation deliberately does NOT widen, or the next person will "unify" the two flags and
   reopen C1.
2. `apps/backstage/src/lib/authz/use-can.test.ts` — mirror the six existing `canFeatureInitiatives` cases
   per flag, plus `canEditCargoCatalog === false` for an `update:BoardSeat` holder (the C1 pin) and
   `manage:all -> false` for all three.
3. `positions-page.tsx` — `canAssignPowerGrants` -> `canEditCargoCatalog` (`:37`, `:178`).
4. `member-invite-drawer.tsx` — -> `canAssignBoardSeat` (`:41`, `:180`).
5. `member-drawer.tsx` — same (`:139`, `:153`).
6. `member-profile-page.tsx` — `gate.canAssignPowerGrants` -> `gate.canAssignBoardSeat` (`:148`, `:176`).
7. `assignable-cargo.ts` — no logic change (C8); one sentence added to the `allowPowerGrants` doc
   comments and the two form prop JSDocs: the branch is "Admin, or an `update:BoardSeat` delegate".

Verify: `pnpm --filter backstage run ci`

Commit: `feat(backstage): split the seat, catalog and login-provision gates`

## Slice 6 — provision affordances move to `canProvisionLogin`

1. `member-invite-drawer.tsx` — `canProvisionLogin` drives `useState` (`:43`), the open-resync
   `useEffect` (`:50-52`), `reset()` (`:56`) and the checkbox render guard (`:184`). **Keep the
   `useEffect`** — its reason (the drawer mounts before the token's claims decode; the store emits empty
   claims first and re-emits) applies harder to a perms-derived flag, since `perms` is minted by
   claims-sync and arrives in the same late token. Rewrite the comment to say "Admin-role or
   `create:MemberLogin`".
2. `member-invite-drawer.test.tsx` — parameterize the claims wrapper (`:10-18`); add: a delegate
   `{roles:["Member"], perms:["create:Member","create:MemberLogin"]}` sees the checkbox, defaults it ON,
   reaches `onProvision`; a `create:Member`-only creator does not see it and `onProvision` is never
   called; a `manage:all` holder does not see it.
3. `member-row-menu.tsx` — `<ActionGate role={["Admin"]}>` at `:50` -> `when={canProvisionLogin}`; hoist
   the `useCan()` call to the component body (hook rules).
4. `member-row-menu.test.tsx` — add a delegate-sees-it case and a `manage:all`-does-not case.
5. `member-profile-page.tsx` — `<ActionGate role={["Admin"]}>` at `:131-133` -> `when={gate.canProvisionLogin}`.
   **Do not touch** the `<ActionGate role={["Admin"]}>` at `:203` around `<MemberRolesPanel>` — `roleIds` /
   `permissionOverrides` writes stay Admin-only, and that is the panel where the delegation is granted.

Verify: `pnpm --filter backstage run ci`

Commit: `feat(backstage): gate the invite affordances on create:MemberLogin`

## Slice 7 — honest empty state for the Cargo combobox

One shared place: both forms render the same `<Field label="Cargo">` + `Combobox options={cargoOptions}`
shape (`member-form.tsx:230-264`, `member-positions-form.tsx:76-104`). Their `locked` / `takedownOnly`
notes legitimately differ in wording, so extract only the new note.

1. `apps/backstage/src/features/members/components/no-assignable-cargos-note.tsx` (new) — props-free,
   in the established `role="note" className="text-ui-xs text-ink-3"` pattern. The quoted permission
   name must equal `permissionLabel("update:BoardSeat")` = "Editar Asientos de directiva"; one comment
   line says so, since the strings live in different features and nothing enforces the match.
2. `member-form.tsx` — render when `!positionsLocked && !allowPowerGrants && cargoOptions.length === 0`,
   in the note stack after `cargoTakedown` (`:306`).
3. `member-positions-form.tsx` — same condition, after the `takedownOnly` note (`:130`).
4. `member-form.test.tsx` — with `allowPowerGrants={false}` and a CEL/power-only positions list, the note
   renders and the combobox has no selectable option; with `allowPowerGrants` the note is absent and the
   CEL option is present.
5. `member-positions-form.test.tsx` — the same pair, plus: when `locked` is true the locked note renders
   and the empty note does not (mutually exclusive today because `cargoOptionsForEditor` appends the held
   cargo disabled — pin it so a future change cannot produce two notes).
6. `assignable-cargo.ts` — no code change; one sentence noting an empty return for a non-delegate is a
   real, expected state the forms explain.

Residual, stated in the PR body and deliberately not fixed: an Admin/delegate facing a genuinely empty
catalog still sees the bare "Sin resultados" from `packages/ui/src/components/combobox.tsx:28`. That is
an empty-catalog problem, not a permissions problem; giving it the delegation copy would be a lie.

Verify: `pnpm --filter backstage run ci`

Commit: `feat(backstage): explain an empty cargo list to a non-delegate`

## Slice 8 — docs, route, review, PR

`docs/specs/position-assignment-lane.md` gains a cross-reference (its "who may assign" narrative is now
one disjunct out of date). `packages/auth/CLAUDE.md`'s Gotchas gains one line naming `BoardSeat` /
`MemberLogin` as hand-granted codes deliberately absent from `BUILT_IN_ROLE_PERMS`.

Then, per the binding review-routing contract:

```bash
.claude/hooks/route.sh
pnpm pr-tests
```

Run whatever the router prints, stamp with the exact command it emits (trailer in the final paragraph),
mirror the token list under `## Reviews` in the PR body.

## Fact-check corrections (applied — cite these, not the originals)

| Plan said | Actually |
|---|---|
| `sync.ts:106-118` cap block | `sync.ts:111-122` |
| "six existing `canFeatureInitiatives` cases" | five, at `use-can.test.ts:44,54,58,64,72` |
| `member-profile-page.tsx:203` roles-panel gate | `:202-206` |
| "define-before-use is this file's convention" | false — `cargoAssignableByNonAdmin()` calls `nonAdminAssignable()` defined *after* it (`firestore.rules:169-175`). Place `boardSeatDelegate()` next to `canCurateFeatured()` (`:323`) instead |
| "worst case ~855 B" | 830 B; longest code unchanged at 20 chars, so the byte count does not move at all |
| insert note after `member-form.tsx:306` | after `:312` (`:306-312` is the whole `cargoTakedown` block). `member-positions-form.tsx:130` is correct as written |
| "`callable-auth` is unasserted today" | no *direct* unit test; indirect coverage at `reseed-role-perms.emulator.test.ts:54` |
| C5: importing `permsFromClaims` pulls in `firebase-admin/firestore` | those imports are **type-only**; the real runtime pull-in is `../chunk.js`, `../firestore-util.js`, `./role-doc.js` (`firestore-deps.ts:3-8`). Argument stands, evidence did not |
| "`members-page.tsx` owns the mutation" | two owners — also a local `InviteAccess` in `member-profile-page.tsx:224-225` |
| "hoist the `useCan()` call" in `member-row-menu.tsx` | nothing to hoist; the component calls no hook. Add the import and the call |
| C7 rejecting-deps literal `:536-547` | `:537-548`. Also unstated: `fakeDeps`' **opts parameter type at `:34-41`** needs the `userPerms` map |
| C8 "fully parameterized (`:41-115`)" | file is 116 lines; `positionsLockedForNonAdmin` (`:41-45`) takes only the cargo — the flag is applied externally at `member-form.tsx:121` / `member-positions-form.tsx:52`. "No change needed" still holds |
| C4 quotes `createPositionsSafe()` | omits the leading `!('positions' in request.resource.data) ||` disjunct (`firestore.rules:224-227`) |
| `member-form.tsx:230-264` Cargo Field | `:230-265` |
| "denied twelve lines above" | ~70 — denial at `rules.test.ts:2941`, insertion point `:3012`, describe runs `:2741-3019` |

**Resolved open question (was Risk 5): token refresh does NOT happen.** `claims.ts` is a pure
14-line decoder; the token comes from `auth-store.ts:54` calling `getIdTokenResult()` with no
`forceRefresh`. A newly granted `update:BoardSeat` / `create:MemberLogin` is invisible to
`firestore.rules`, `requireAdminOrPerm` and `useCan` until the hourly refresh or a re-login.
**Operator note for the spec: after granting or revoking either code, the delegate must sign out
and back in.** Not fixed here — a force-refresh on every load costs a network round trip on the
critical path.

## Risks and open questions

1. **C1 is the review's centre of gravity.** A single widened `canAssignPowerGrants` silently delegates
   the `/positions` catalog editor. Verify `positions-page.tsx` reads `canEditCargoCatalog` and that
   `use-can.test.ts` pins `canEditCargoCatalog === false` for an `update:BoardSeat` holder.
2. **`update:BoardSeat` grants nothing alone, and the UI does not say so.** An Admin ticking only that
   box produces a delegate who can still do nothing — they also need `update:Position` or
   `update:Member`. Neither surface hints at the dependency. Documented in the spec; not otherwise fixed.
3. **Revocation is retroactive and silent.** Removing the perm de-elevates the people they seated on the
   *next write* to each member doc — possibly never. Inherited from the existing Admin behaviour, but
   "revoke the delegation" is not "undo what they did". No operator sweep short of `recomputeAllClaims`.
4. **The cap can silently revoke the delegation.** A delegate exceeding `PERMISSION_CAP = 30` is written
   `perms: []` fail-closed, taking `update:BoardSeat` with it.
5. **Token freshness on grant.** Rules, `requireAdminOrPerm` and `useCan` all read `perms` off the ID
   token. A newly granted code does not take effect until the token refreshes. Verify whether
   `apps/backstage/src/lib/authz/claims.ts` force-refreshes; if not, the delegate sees "no access" for up
   to an hour with no explanation. Not addressed here.
6. **`stringArrayClaim` vs. reusing `permsFromClaims` (C5).** A reviewer applying guardrail #1
   mechanically will call the new reader a copy. Counter-argument is in C5; cheap to switch to a shared
   `apps/beacon/src/claims-read.ts` if a reviewer insists.
7. **Rules-test non-vacuity.** Three new rules tests pass for the wrong reason if their principal is
   under-permissioned. Check each `as(uid, [], [...])` literal by hand.
8. **The grant-free-CEL takedown has no test today.** Slice 2 adds it at the same time as the change to
   the expression it depends on, so it proves post-change behaviour, not preservation. Stronger evidence
   would land that test on `main` first.
9. **No end-to-end cross-product test.** `use-can.test.ts` and `callable-auth.test.ts` each pin
   independence at their own layer; nothing tests a `create:MemberLogin`-only holder seeing the invite
   button and an empty cargo list simultaneously. Deliberate omission.
