# Board-seat and member-login delegation

Two explicitly grantable permission codes that let an Admin **temporarily** delegate work that
was previously hardcoded to the `Admin` role, then revoke it. Both are granted per member in the
`/members/$memberId` overrides panel (Admin-only) or per role in the `/permisos` matrix.

## The two codes

| Subject | Label in the matrix | Live code | Confers |
|---|---|---|---|
| `BoardSeat` | Asientos de directiva | `update:BoardSeat` | seat a member on **any vacant cargo** — CEL category and power-granting alike |
| `MemberLogin` | Acceso de miembros | `create:MemberLogin` | call `provisionMemberLogin` for a member who has **no login yet**: create their Auth account, link their uid, return the password-reset link |

They are independent by construction. An Admin can grant emailing without board seating and vice
versa. The other five codes each subject generates (`manage:BoardSeat`, `read:MemberLogin`, …)
are inert: every gate is an exact `hasPerm` code test, never a `canDo` expansion, so `manage:all`
does not satisfy either one.

## What `update:BoardSeat` does NOT do

- **It confers nothing on its own.** It only widens the cargo set for an editor who *already*
  holds `update:Member`, `create:Member`, or `update:Position`. A member holding only
  `update:BoardSeat` still cannot write anything. Granting it alone is a no-op; the UI does not
  say so.
- **It does not confer Admin.** See the section below — an Admin-granting cargo mints nothing
  unless the assigner holds the Admin role.
- **It does not unseat anyone.** `currentCargoGrantsEmpty()` stays Admin-only, so a delegate
  cannot displace a member sitting on a power-granting cargo. Hand-over is an Admin action.
  One caveat, pre-existing and pinned by a rules test: that predicate reads only the CURRENT
  term, so in the window after a UTC-year rollover an Admin's next-term slot is empty and any
  `update:Position` holder can write into it.
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

## Conferring Admin stays Admin-only

The chapter owner accepted that a delegate may seat power-granting cargos, on the explicit
premise that the delegation is **revocable**. Delivering that premise turned out to require one
rule, and it is the load-bearing guard of the whole feature:

**A cargo whose `grants` include `Admin` is honored only when the assigner holds the Admin
ROLE.** Every other cargo is honored for an `update:BoardSeat` delegate too.

Why, precisely: a minted Admin is itself a trust source, so a delegate who can mint one has
made the delegation permanent. Revoking their code de-elevates nobody, and neither
`recomputeAllClaims` nor any in-app path recovers it.

Two earlier forms of this guard were wrong and are recorded so they are not re-proposed:

- **Blocking only self-assignment** (`assignedBy === member.uid`) stops the one-write self-loop
  and misses the two-write puppet loop: the delegate creates a second member on a mailbox they
  control, seats *it* on Presidente — not a self-assignment, so the perm is trusted — and that
  puppet is Admin forever.
- Worse, that same form **strips the sitting president**. `seed-president.mjs` stamps
  `assignedBy` with the president's own uid, and an Admin's perms are `manage:all`, never the
  exact `update:BoardSeat` code — so the president's own Admin claim would be dropped on the
  next write to their member doc. Confirmed against the live production member doc before it
  shipped, and pinned by a regression test.

**The cost, so it is not read as a bug:** a delegate seating someone on an Admin-granting cargo
publishes the seat but mints no claim. An Admin must re-stamp it. Everything a delegate *can*
confer is genuinely revocable — strip the perm and the next write to that member drops the
grants.

## `create:MemberLogin` — what is actually privileged

The invite **email** is not. `apps/backstage/src/lib/auth/request-password-reset.ts` is a plain
client-side `sendPasswordResetEmail` that any signed-in user can already call. What the callable
owns is Auth account creation, uid linking (the only path that can write `members.uid` at all,
since the rules forbid it on every client lane) and the initial claim write.

**A non-Admin caller may provision a member only when that member has NO login yet** — no
existing Auth account for their email, and no stored `uid`. Adoption, re-provision/resend, and
the deleted-account self-heal are all Admin-only.

**And only when that member carries no grants of either kind.** `syncMemberClaims` mints from
two independent sources, so the guard has to ask about both:

- *Direct grants* — `roleIds` and `permissionOverrides` become `perms`, with no cargo involved.
  These are exactly what the Admin-only roles panel writes, so "granted but not yet invited" is
  as ordinary a state as "seated but not yet invited".
- *Cargo grants* — a cargo's `grants` become `roles`. The guard checks EVERY term in the map,
  not just the current one: `syncMemberClaims` reads the current term at trigger time, so a
  future-term entry is invisible today and mints on the UTC-year rollover.

**And only when that member is not POWER-SEATED.** "Unprovisioned" does not mean "enrolled by
this delegate": every uid-less member is reachable by `memberId`, including one an Admin already
seated on an Admin-granting cargo — the normal state between being seated and being invited.
Linking a uid fires `onMemberWritten`, and `resolveTrustedGrants` reads the *stored* `assignedBy`
— a genuine Admin — so the grants are honored and Admin is minted onto the account this call
just created. The delegate forges nothing. So a non-Admin provision is refused whenever the
member's current-term cargo carries any grants, and fails closed when that cargo cannot be read.

**A non-Admin caller never receives the `actionLink`.** `generatePasswordResetLink` returns a
bearer credential for the account; the client sends the invite itself through the unprivileged
`sendPasswordResetEmail`, so a delegate has no need to hold it. This is defence in depth behind
the power-seat guard, not a substitute for it — with `manage:Member` an attacker can rewrite
`members.email` first (the rules do not pin it) and receive the ordinary reset mail in their own
inbox, which suppressing the link alone would not stop.

The resend path is restricted for the same reason as adoption, and it is the less obvious one:
`passwordResetLink` is `generatePasswordResetLink`, which returns the oobCode URL **to the
caller** — categorically different from `sendPasswordResetEmail`, which delivers the secret to
the mailbox owner. So a delegate permitted to "resend" could pass the president's `memberId`,
receive a live reset link for their address, set a password and sign in as them, with every
other guard satisfied. Adoption is worse still: `members.email` is unconstrained by the rules
and has no uniqueness check, so a delegate could file a member doc carrying an Admin's email and
have the callable adopt that account, strip its claims and link its uid onto their own doc.

This costs the delegation nothing: a genuinely new member has neither an account nor a uid.

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
5. **Verify who you seat.** One residual no guard can close, and it is not specific to this
   delegation — it is why enrolment and seating should not both be delegated blindly. A member
   creator controls the `email` on the doc they file, and the invite goes to that address. So if
   an Admin later seats a FABRICATED member on an Admin-granting cargo, the claim is minted onto
   an account the fabricator controls. The chain needs an Admin to seat someone they did not
   verify; it existed before this feature (an Admin provisioning the same fabricated doc sends
   the invite to the same attacker address), and the power-seat guard means a delegate cannot
   complete it alone. Treat the members list as the thing you verify before seating.
6. **There is a consistency window.** `firestore.rules` reads the token while beacon reads stored
   claims. If a delegate's own perms are dropped (cap breach, or revocation) their cached token
   still passes the rules for up to an hour, so a seat write can succeed while
   `resolveTrustedGrants` declines to mint the grants. The member is then published on the public
   Directiva with no claim — visible, powerless. Re-running the write after the token refreshes
   resolves it.

## Out of scope

Creating or editing cargo docs; `roleIds` / `permissionOverrides` assignment; unseating a sitting
power-cargo holder; delegating `setUserRoles`, `seedRoles`, `recomputeAllClaims` or
`reseedBuiltInRolePerms`. All stay Admin-role-only.
