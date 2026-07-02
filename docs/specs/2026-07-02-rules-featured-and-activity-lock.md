# Rules hardening: `featured` create-gate + server-side activity lock

**Source:** full-audit 2026-07-02, backlog items 1+2 (both Medium, sensitive).
**Branch:** `fix/rules-featured-and-activity-lock` — one PR, TDD, fully gated.

## Item 1 — gate `featured` on the projects/programs CREATE path

### Problem

`initiativeCreateAllowed()` (firestore.rules:153) is perm-based (`canDo('create', subject)`).
The comment above `featuredUpdateSafe()` claims "Create is Admin/PM-only" — false. Any
custom role holding `create:Project`/`create:Program` can create a doc with
`featured: true` and (once finalized) publish straight onto the public /programas
showcase. The update path already restricts `featured` flips to the Admin/ProjectManager
*roles*; create must mirror that authority.

### Fix

Add to `initiativeCreateAllowed(subject)`:

```
&& (hasAnyRole(['Admin', 'ProjectManager'])
    || request.resource.data.get('featured', false) == false)
```

- Explicit `featured: false` stays allowed for any creator (forms echo defaults).
- Correct the lying comment block.

## Item 2 — enforce the activity lock server-side

### Problem

Once an activity has check-ins, `category`/`startAt`/`parentId` must be immutable —
they feed the points derivation (`resolvePointRuleCode`, punctuality factor,
report gate), so mutating them after points were computed silently corrupts the
ledger's meaning. Today the lock lives only in `ActivityRepository.update()`
(client-side count query) — any direct Firestore write bypasses it. Rules cannot
query the `checkIns` collection.

### Design decision (approaches weighed)

- **A. Beacon-maintained `hasCheckIns: boolean` on the activity doc (CHOSEN).**
  `awardPoints` already fires on every `checkIns/{id}` write. After engine work it
  recomputes the flag from a `count()` aggregate over `checkIns where activityId ==`
  inside a transaction and writes it only when the value flips (write-skip guard,
  #103 pattern — every `activities` write fires `onActivityWritten` showcase
  re-projection, so unconditional writes would amplify). Idempotent under
  at-least-once redelivery: recompute-from-truth, never increment. Rules read the
  flag via `resource.data` — free.
- **B. Monotonic flag (set true on first check-in, never cleared).** Simpler, but a
  full undo (delete all check-ins — supported since #117) would leave the activity
  locked forever, diverging from the client repository's live-count behavior. Rejected.
- **C. Marker doc `activityCheckInMeta/{activityId}` + rules `exists()`.** Same beacon
  work, plus one billed `get()` on every activity update and a new collection. Rejected.

### Rules changes (`match /activities/{activityId}`)

```
// hasCheckIns is beacon-owned (admin SDK, bypasses rules): clients may never
// set or change it.
allow create: if canDo('create', 'Activity')
  && !('hasCheckIns' in request.resource.data);
allow update: if (canDo('update', 'Activity') || activityParentDirection())
  && unchanged('hasCheckIns')
  && activityLockSafe();
```

```
function activityLockSafe() {
  return resource.data.get('hasCheckIns', false) != true
    || (unchanged('category')
        && unchanged('startAt')
        && unchanged('parentId')
        && unchanged('parentType'));
}
```

- `parentType` locks alongside `parentId`: the pair addresses one parent; flipping
  the type alone re-points the same id at the other collection and changes
  `resolvePointRuleCode` input. (Audit named category/startAt/parentId; parentType
  is the same invariant.)
- Legacy docs without the field read as unlocked (`get(..., false)`) — correct,
  they predate check-ins or the flag backfills on the next check-in write.
- Echo-unchanged writes pass: the backstage mapper always sends all fields; equal
  Timestamps compare equal.

### Beacon changes

New `apps/beacon/src/award-points/activity-lock.ts`:

```ts
export async function syncActivityCheckInFlag(db: Firestore, activityId: string): Promise<void>
```

Transaction: `tx.get(activities/{id})` + `tx.get(count query)`; missing activity → no-op;
`desired = count > 0`; write `{ hasCheckIns: desired }` only when it differs from the
stored value (strict `!== true/false` comparison so a non-boolean legacy value gets a
corrective write, mirroring the totalPoints guard).

`awardPoints` trigger: after the existing engine branches, extract `activityId` from
the after-doc (falling back to before-doc on delete), validate with `isCleanId`, and
call `syncActivityCheckInFlag`. Runs even when `validateCheckIn` returns null — a
malformed check-in doc still matches the count query, so it must still lock. Errors
propagate (unlike the cosmetic showcase projection): points work is already done and
idempotent, so a retry is safe and keeps the flag consistent.

### Known window (accepted)

The flag lands with trigger latency: between the first check-in write and the flag
write, a locked-field edit passes rules. The client repository's live-count guard
stays as the UX-level check; the rules gate is defense-in-depth that closes the
*persistent* bypass. Documented in the rules comment.

### Type change

`packages/types/src/engine/activity.ts` — `Activity` gains
`hasCheckIns?: boolean` (beacon-maintained, documented as such). No backstage
code change: the repository keeps its live-count guard.

## Tests (TDD — RED first)

1. **Rules** (`tests/firestore-rules/rules.test.ts`, claims via real seed producer):
   - custom-perm `create:Project` holder creates `featured: true` → deny;
     `featured: false` / absent → allow; Admin and ProjectManager `featured: true` → allow.
     Same for programs.
   - activity with `hasCheckIns: true`: Admin edit changing `category` (or `startAt`,
     `parentId`+`parentType`) → deny; same-value echo update → allow; title-only
     change → allow. `hasCheckIns: false`/absent → category change allowed.
   - client sets `hasCheckIns` on create → deny; client flips it on update → deny
     (both for Admin — beacon-only field).
   - direction-branch editor on a locked parented activity: echo passes, locked-field
     change denied.
2. **Beacon emulator** (`activity-lock.emulator.test.ts`, runs in existing
   `test:emulator` job): create → flag true; delete last → flag false; unchanged →
   zero issued writes (proxy counter, delta-based); missing activity → no throw;
   malformed check-in doc with valid activityId → still flips.

## Gates

Rules suite green + beacon ci + `pnpm pr-tests` → `/security-review` +
`firestore-security-reviewer` + `firebase-functions-reviewer` + `/code-review` →
`Security-Reviewed` trailer → PR.
