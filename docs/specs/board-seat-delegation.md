# Board-seat and member-login delegation

Two explicitly grantable permission codes that let an Admin **temporarily** delegate work that
was previously hardcoded to the `Admin` role, then revoke it. Both are granted per member in the
`/members/$memberId` overrides panel (Admin-only) or per role in the `/permisos` matrix.

## The two codes

| Subject | Label in the matrix | Live code | Confers |
|---|---|---|---|
| `BoardSeat` | Asientos de directiva | `update:BoardSeat` | seat a member on **any vacant cargo** — CEL category and power-granting alike |
| `MemberLogin` | Acceso de miembros | `create:MemberLogin` | call `provisionMemberLogin`: create the member's Auth account, link their uid, return the password-reset link |

They are independent by construction. An Admin can grant emailing without board seating and vice
versa. The other five codes each subject generates (`manage:BoardSeat`, `read:MemberLogin`, …)
are inert: every gate is an exact `hasPerm` code test, never a `canDo` expansion, so `manage:all`
does not satisfy either one.

## What `update:BoardSeat` does NOT do

- **It confers nothing on its own.** It only widens the cargo set for an editor who *already*
  holds `update:Member`, `create:Member`, or `update:Position`. A member holding only
  `update:BoardSeat` still cannot write anything. Granting it alone is a no-op; the UI does not
  say so.
- **It does not unseat anyone.** `currentCargoGrantsEmpty()` stays Admin-only, so a delegate
  cannot displace a member sitting on a power-granting cargo. Hand-over is an Admin action.
  Rationale: the `roles` claim is derived *exclusively* from cargo grants
  (`compute-roles.ts`), so clearing every Admin's cargo would strip every Admin claim in the
  chapter — and `setUserRoles`, `roles/*` writes and `permissionOverrides` writes are all
  Admin-only, making that state unrecoverable outside the Firebase console.
- **It does not reach the `/positions` catalog.** Creating a CEL or JDL cargo, and editing any
  cargo's `grants`, `category` or board `title`/`titleFemale`, stay Admin-only
  (`boardSurfacingCategory()` and the update-arm pins). The delegate seats members on cargos
  that already exist.
- **It does not touch `roleIds` or `permissionOverrides`.** `createPermissionAssignmentSafe()` /
  `updatePermissionAssignmentSafe()` are unchanged, so a delegate cannot re-grant the delegation
  to themselves or anyone else.

## Accepted decision — claims-minting delegation

The chapter owner has explicitly accepted that a delegate may seat a member on a cargo whose
`grants` include `Admin`, and that beacon's trust gate will mint that claim. That is the feature,
not a defect. The acceptance is premised on the delegation being **revocable**, which required
one guard:

**The trust gate is non-reflexive.** When `assignedBy === member.uid` (a self-assignment),
`resolveTrustedGrants` trusts only `update:BoardSeat` in the assigner's `perms` — never an
`Admin` role in their `roles`. Without this, a delegate who self-seats `Presidente` is minted
`Admin`, and that minted `Admin` then satisfies the very gate that minted it: revoking
`update:BoardSeat` re-fires the trigger, the Admin disjunct passes, and the grants are re-honored
forever. `recomputeAllClaims` runs the same code and would not break the loop either. An Admin
seating *someone else* is unaffected.

## `create:MemberLogin` — what is actually privileged

The invite **email** is not. `apps/backstage/src/lib/auth/request-password-reset.ts` is a plain
client-side `sendPasswordResetEmail` that any signed-in user can already call. What the callable
owns is Auth account creation, uid linking (the only path that can write `members.uid` at all,
since the rules forbid it on every client lane) and the initial claim write.

**A non-Admin caller may only mint a NEW Auth account, or re-provision one already linked to that
same member.** It may never adopt a pre-existing unlinked account. Without that restriction the
code would be an account-takeover primitive rather than an invite helper: `members.email` is
unconstrained by the rules and has no uniqueness check, so a delegate could create a member doc
carrying a sitting Admin's email and have the callable adopt that Admin's account, strip its
claims, link its uid onto the attacker's member doc, and return a password-reset link for it.
An Admin caller keeps the full adoption path — it is the documented recovery op.

This restriction costs the delegation nothing: a genuinely new member has no Auth account.

## Operator notes

1. **Grant `update:BoardSeat` together with a member-editing capability.** On its own it does
   nothing. The usual pairing is the `Membresía` role (which carries `manage:Member`) plus the
   `update:BoardSeat` override; an org-chart-only delegate wants `update:Position` instead.
2. **The delegate must sign out and back in after being granted or revoked.** All three gates —
   `firestore.rules`, `requireAdminOrPerm` and `useCan` — read the `perms` claim off the ID
   token, and `auth-store.ts` calls `getIdTokenResult()` without `forceRefresh`. A freshly
   granted code is invisible for up to an hour otherwise, and a freshly revoked one keeps
   working for up to an hour.
3. **Revocation is not an undo.** Removing the code stops future seating. Members already seated
   keep their cargo, and their cargo-derived claims are recomputed on the *next write* to their
   member doc — which may be much later. To force it, re-write the member docs or run
   `recomputeAllClaims`.
4. **The `PERMISSION_CAP` interaction.** A member whose resolved perms exceed 30 is written
   `perms: []` fail-closed, which silently takes `update:BoardSeat` with it. Two more subjects
   in the vocabulary make the 30-slot budget marginally tighter.
5. **There is a consistency window.** `firestore.rules` reads the token while beacon reads stored
   claims. If a delegate's own perms are dropped (cap breach, or revocation) their cached token
   still passes the rules for up to an hour, so a seat write can succeed while
   `resolveTrustedGrants` declines to mint the grants. The member is then published on the public
   Directiva with no claim — visible, powerless. Re-running the write after the token refreshes
   resolves it.

## Out of scope

Creating or editing cargo docs; `roleIds` / `permissionOverrides` assignment; unseating a sitting
power-cargo holder; delegating `setUserRoles`, `seedRoles`, `recomputeAllClaims` or
`reseedBuiltInRolePerms`. All stay Admin-role-only.
