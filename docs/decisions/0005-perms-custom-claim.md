# 0005. Coarse permissions in a `perms` custom claim

**Status:** Accepted
**Date:** 2026-08-03 (role table); the claim mechanism predates it
**Source:** `docs/specs/builtin-role-set.md`; `docs/specs/role-lifecycle.md`;
`packages/types/src/permission.ts` (`PERMISSION_CAP = 30`);
`packages/auth/src/perms.ts` (`resolveEffectivePerms`); `firestore.rules`.

## Context

Firestore rules can only read what is in the ID token. A rule cannot fetch a member's
role document to decide whether a write is allowed without paying a document read on
every single operation. So authority has to travel **in the token**.

At the same time, a chapter needs to define its own roles. Hard-coding the role set
would mean a deploy every time a board reorganized its commissions — for volunteers,
that is the same as "impossible".

Firebase custom claims are capped at roughly 1000 bytes. That cap is the central
constraint of this design.

## Decision

Coarse `action:Subject` permission codes, resolved server-side and minted into a `perms`
custom claim.

**Resolution** (`resolveEffectivePerms`): union of all the member's role documents'
permissions, plus per-member override grants, minus per-member override revokes.
**Revoke wins.** Result is deduped and sorted, so an unchanged permission set produces a
byte-identical claim and the trigger can skip the write.

**The cap is enforced fail-closed.** `PERMISSION_CAP = 30`. Over the cap, the beacon
trigger does **not mint the claim at all** — it does not truncate. A member with too
many permissions gets none, which is visible and safe, rather than an arbitrary subset,
which is neither. The admin UI shows the same limit as a save-blocking preview.

**Roles are documents**, edited at runtime in `/permisos`. `roles/{roleId}` owns both the
display name and the permission list. A built-in role set ships as a seed
(`Admin`, `Membership`, `ProjectManager`, `ExecutiveCommittee`, `ActivityManager`,
`Scanner`, `Member`, `Secretary`, `Treasury`) but the constant is a **seed snapshot, not
a source of truth** — see Consequences.

## Consequences

**Easy:** rules authorize from the token with no extra reads; a chapter redefines its
own roles without a deploy; permissions are auditable as data.

**Hard:**

- **Coarse only.** `manage:Member` cannot express "only members in my commission".
  Anything object-scoped has to live elsewhere — that is
  [0006](0006-casl-for-abilities.md)'s conditional grants plus a conjunct in
  `firestore.rules`.
- **The claim is downstream of two triggers.** `onMemberWritten` and `onRoleWritten`
  re-mint it. A member's effective authority changes only after the trigger runs and
  their token refreshes — it is not instantaneous.
- **A reseed strips hand-granted permissions.** Because the built-in constant is a seed
  snapshot, re-running the seed overwrites a built-in role's permission list with the
  constant's version. Permissions granted by hand in `/permisos` on a built-in role are
  lost. This has happened in production, across five roles.
- **30 is a real ceiling.** A chapter wanting fine-grained roles will hit it.

**Ruled out:** per-request permission lookups; Firebase's built-in role model, which
cannot express chapter-defined roles.
