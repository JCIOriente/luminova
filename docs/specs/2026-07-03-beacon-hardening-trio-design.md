# Beacon Hardening Trio (audit item 3) — Design

**Date:** 2026-07-03
**Status:** Approved (autonomous run; decisions recorded below)
**Scope:** apps/beacon, firestore.rules, tests/firestore-rules, apps/backstage (one parity touch)
**Source:** docs/status/2026-07-02-full-audit.md — beacon findings at `provision-member-login.ts:74`, `index.ts:86`, `claims-sync/sync.ts:44`.

## (a) provisionMemberLogin must not silently overwrite `members/{id}.uid`

### Problem

The callable resolves an Auth user by the member's email and unconditionally
writes `update({ uid: user.uid })`. If the member was already provisioned and
the email has since changed, the lookup resolves (or creates) a *different*
Auth user; the overwrite orphans the old Auth account, which keeps its custom
claims (possibly Admin) with no member doc backing them, and silently breaks
its self-read (`resource.data.uid == request.auth.uid`).

### Decision: reject on conflict, allow idempotent re-provision

- Resolve the Auth user by email **without creating** first.
- If the member doc holds a non-empty `uid` and the resolved user is missing
  or has a different `uid` → throw `failed-precondition`
  (`"member is already linked to a different login"`). No Auth user is
  created, no claims are written, no doc write happens.
- If the stored `uid` matches the resolved user → proceed unchanged. This is
  the resend-invite path: claims re-bootstrap, the `uid` write is a no-op that
  re-fires `onMemberWritten` (self-heal), a fresh reset link is returned.

**Alternative rejected — explicit transfer flag** (`transferLogin: true`
allowing overwrite + stripping the old account's claims): real email-change
flows are rare at JCI scale, transfer needs its own claim-revocation +
audit design, and today it is a deliberate console op. Reject is fail-closed
and reversible; a transfer flag can be added later without breaking callers.

### Testability

The callable body moves onto a small deps port (`ProvisionDeps`:
member read, auth get/create by email, claims write, uid link, reset link)
with a pure orchestration function `provisionMember(deps, memberId)` unit
tested with fakes — same port pattern as `award-points/process.ts`.
`onCall` glue stays thin.

## (b) awardPoints: identity-field updates on checkIns

### Problem

`awardPoints` branches only on create/delete. An update that changes a
check-in's identity (`memberId`/`activityId`/`role`) derives a *new*
deterministic participation id and leaves the old row orphaned (points kept
by the old member/activity). firestore.rules already deny all client updates
(`allow update: if false`), so this is trigger-side defense-in-depth against
admin-SDK/console writes — sized accordingly (no emulator machinery added).

### Decision: update = reconcile(before) + apply(after)

New orchestration `processCheckInUpdate(store, before, after)` in
`award-points/process.ts` (unit-tested against the in-memory `EngineStore`
fake):

- Both sides valid, identity changed → `processCheckInDelete(before)` then
  `processCheckIn(after)`. Old row removed, both aggregates recomputed.
- Both valid, identity unchanged → `processCheckIn(after)` (today's behavior:
  recompute in place).
- Valid → malformed → `processCheckInDelete(before)` (a doc that no longer
  parses must not keep its derived row).
- Malformed → valid → `processCheckIn(after)` (malformed create never
  produced a row).

Flag mirror: the activity `hasCheckIns` lock must re-sync **both** the old
and new `activityId` on an identity move (the old activity's count dropped).
A pure helper `checkInActivityIds(beforeRaw, afterRaw)` collects the clean
ids from both sides; `index.ts` runs `syncActivityCheckInFlag` per id. The
unconditional-write conflict anchor inside `syncActivityCheckInFlag` is
untouched.

Idempotency under `retry: true`: delete + create are both already idempotent
(deterministic ids, recompute-from-rows aggregates, recompute-from-count
flag); redelivering the update replays both halves to the same state.
`validateCheckIn` still never throws → no retry storm.

## (c) `assignedBy` shared per-term field

### Problem

`TermPositions.assignedBy` is one field per term shared by the cargo and all
comisiones. Rules force `assignedBy == request.auth.uid` on every positions
write (anti-impersonation), so a *permitted* non-Admin edit (e.g.
ExecutiveCommittee reshuffling comisiones) restamps it, and the claims-sync
trust gate then drops previously Admin-granted power. For **cargos** the
rules already prevent this (`cargoGrantsEmpty()` denies any non-Admin write
while a power cargo is assigned). The hole is **power comisiones** only —
rules cannot iterate `comisionIds` to check their grants.

### Decision: enforce the existing "comisiones confer no power" invariant server-side

The client already treats comisiones as chips-only: `position-schema.ts`
rejects Comision grants ("Las comisiones no otorgan permisos"), the catalog
form hides the grants control for comisiones and clears it on category
switch, and no seed ships a power comisión. Only the server lags. Changes:

1. **firestore.rules `/positions`**: create and update additionally require
   `request.resource.data.category != 'Comision' ||
   request.resource.data.grants == []` — Admin included (the invariant is
   structural, not an authority question). This also closes the
   category-flip ride-along (updating a power JDL cargo to `Comision` while
   keeping grants).
2. **claims-sync `sync.ts`**: `resolveTrustedGrants` consumes the **cargo
   only**; `comisionIds` are never fetched for grants. Defense-in-depth
   against console-written power comisiones *and* against smuggling a power
   cargo's position id inside `comisionIds` (never rules-checked).
3. **backstage parity** (`members/lib/member-permissions.ts`): the effective-
   roles aggregation counts cargo grants only, so the permissions panel
   matches what the trigger will actually mint.

Net effect: power flows only through the cargo (rules-gated end to end) and
Admin-managed custom roles. `assignedBy` stays a single per-term field, and
no permitted self-edit can strip Admin-granted power because a power cargo
blocks non-Admin positions writes outright.

**Alternatives rejected:**
- **Per-grant `assignedBy`** (map keyed by position id): rules cannot iterate
  map entries to verify each new entry is self-stamped, so a non-Admin could
  forge `assignedBy = <admin-uid>` on a new comisión entry and the trigger
  would honor it — a security *regression* — besides being an L-size
  migration across types/mapper/rules/trigger/UI.
- **Freeze `comisionIds` for non-Admins**: closes the hole but removes
  ExecutiveCommittee's org-chart workflow (assigning plain comisiones is the
  common case) to protect an entity class (power comisiones) the product
  already forbids.
- A future genuine "power comisión" use-case is served by custom roles
  (`roleIds`, Admin-only) or by modeling it as a JDL position.

## Testing (TDD, RED first)

- **(a)** `provision-member-login.test.ts`: conflict rejected before any
  side effect (no createUser/claims/link calls on the fake), same-uid
  re-provision succeeds, unprovisioned flow unchanged, existing
  validate/nextClaims tests keep passing.
- **(b)** `process.test.ts` (in-memory FakeStore): identity change deletes
  the old row + recomputes both aggregates; unchanged-identity update
  recomputes in place; valid→malformed deletes; malformed→valid creates;
  redelivered update is a no-op the second time. `check-in.test.ts`:
  `checkInIdentityChanged` + `checkInActivityIds` pure cases.
- **(c)** `sync.test.ts`: comisión grants ignored even with a live-Admin
  `assignedBy` (rewrites the current cargo+comisión union test); cargo
  grants still honored. `tests/firestore-rules/rules.test.ts`: Admin create
  Comision-with-grants denied; Admin category-flip-to-Comision keeping
  grants denied; ExecutiveCommittee create plain comisión still allowed;
  existing positions suite green. Claims built via the real seed producer
  (`permsForRoles`), as the suite already does.

## Gates

/simplify → beacon `run ci` (unit + emulator) + rules suite →
`firebase-functions-reviewer` + `firestore-security-reviewer` →
`/security-review` → `/code-review` → Security-Reviewed trailer → PR →
`pnpm pr-tests`.
