# B1 — Member home (design)

_Date: 2026-06-06 · Branch: `feat/member-home` · Roadmap: B1 (depends F1, A5; unblocks the member-facing surface)_

## Goal

A JCI member logs in and sees their own recognition data: points + monthly
breakdown, personal QR, participation history, and their rank by points — reusing
the A5/A6/A3 components. Members get a login via an Admin-invite flow (the
F1-deferred uid provisioning).

## Decisions (brainstorm)

- **Provisioning** — an Admin-guarded beacon callable creates/links the member's
  Auth user, sets the `Member` role claim, writes `member.uid`, and returns a
  password-reset link the Admin relays out-of-band (no email infra yet).
- **Surface** — role-aware home in the existing backstage app: a `/me` route plus
  a landing redirect (member-only users → `/me`; admins keep the Overview). This
  is B1 + a thin slice of B2.
- **v1 home** — points + byMonth, personal QR, participation ledger, own rank.
- **Rank** — computed from `memberPoints` alone (no all-members read, no engine
  change); the full eligibility-filtered A6 leaderboard stays board/admin-only for
  now (its nav is gated off plain Members).

## Constraint surfaced

A6's leaderboard reads **all** member docs (`useMembers`) for names + eligibility,
but the `members` read rule only lets a plain Member read their **own** doc. No
member can log in today, so this never fired — B1 is when it would. v1 sidesteps
it (member rank from `memberPoints` only; A6 nav hidden from plain Members). The
proper fix (denormalize `memberName` + eligibility onto `memberPoints`, engine-
written, so A6 serves members again) is deferred.

## Units

### beacon — `provisionMemberLogin` (callable)
- `apps/beacon/src/provision-member-login.ts` — `onCall`, Admin-guarded (mirrors
  `setUserRoles`). Input `{ memberId }`. Admin-SDK flow:
  1. Read `members/{memberId}` → require exists + `active` + non-empty `email`.
  2. `getUserByEmail(email)` else `createUser({ email })`.
  3. `setCustomUserClaims(uid, nextClaims(existingClaims, 'Member'))` — merge, never
     clobber other roles / `scannerEventIds`.
  4. Write `members/{memberId}.uid = uid` (admin SDK; bypasses the uid-immutable rule).
  5. `generatePasswordResetLink(email)` → return `{ email, actionLink }`.
  Idempotent (re-invite reuses uid, fresh link). `memberId` validated clean (no `/`).
- Pure helpers (unit-tested): `validateProvisionInput(data) → { memberId }`;
  `nextClaims(existing, role) → { roles, scannerEventIds? }` (unique union, preserves
  other claims).
- Glue (getUserByEmail/createUser/setClaims/generateLink/firestore write) —
  emulator-tested, not unit.

### backstage — member home
- `MemberRepository.getByUid(uid)` — `query(where('uid','==',uid), limit(1))` →
  `Member | null`. Rule already allows (own-doc read).
- `hooks/use-current-member.ts` — reads the auth uid from context, calls `getByUid`.
- `lib/points-rank.ts` (pure) — `pointsRank(allPoints: MemberPoints[], memberId) →
  { rank, total }` = `#(cumulative > mine) + 1` over entries with `cumulative > 0`;
  `total` = that eligible count. Returns null if the member has no entry.
- `features/members/components/member-points-summary.tsx` — extracted from the A5
  profile's inline points block (cumulative + byMonth list + Sparkline). Consumed
  by both `/members/:id` and `/me` (DRY).
- Route `_app.me.tsx` (`/me`): current member → `MemberPointsSummary` + personal QR
  (`encodeMemberQr` + `@luminova/ui/qr-code`) + `ParticipationLedger` + rank line
  ("Puesto por puntos · N de M"). Null member → "Tu usuario no está vinculado a un
  perfil de miembro." Loading/error states.

### backstage — provisioning UI
- `features/members/hooks/use-provision-member-login.ts` — mutation calling the
  callable via `httpsCallable(getFirebase().functions, 'provisionMemberLogin')`.
  (Add the `functions` instance to `@luminova/firebase` if not exported.)
- A5 profile header action (Admin-gated): "Invitar acceso" (or "Reenviar acceso"
  when `member.uid` is set) → calls the mutation → shows `actionLink` in a `Dialog`
  with a copy-to-clipboard button.

### backstage — routing / nav
- `_app.index.tsx` `beforeLoad`: if `isMemberOnly(claims)` → `redirect({ to: '/me' })`.
- `lib/authz/is-member-only.ts` (pure) — `isMemberOnly(claims)` = `roles` includes
  `Member` and none of `Admin/Membership/Treasury/ExecutiveCommittee/ProjectManager`.
- `nav-config.ts` — add `{ to: '/me', label: 'Mi panel', icon: 'user' }` (a "Panel"
  group item or top); add an optional `roles?: Role[]` allowlist axis to `NavItem`;
  gate `/leaderboard` with `roles: ['Admin','Membership','Treasury','ExecutiveCommittee','ProjectManager']`
  (hidden from plain Members until the projection lands). Sidebar filter honors
  `roles`.

### firestore.rules
**Untouched.** Member reads (own doc, `memberPoints`, `participations`) already
permitted; `member.uid` written by the admin-SDK callable. Trust boundary is the
callable.

## Testing (TDD)

- **Pure unit**: `nextClaims`, `validateProvisionInput`, `pointsRank`,
  `isMemberOnly`.
- **beacon emulator e2e**: call `provisionMemberLogin(memberId)` → assert Auth user
  exists with `Member` claim, `member.uid` written, a reset link returned;
  re-invite is idempotent.
- **backstage RTL**: `/me` render (points/QR/ledger/rank), null-member state, nav
  `roles` gating, `MemberPointsSummary` extraction parity.
- **Full e2e** (live emulator): provision a member → sign in as them → `/me` shows
  their data; landing `/` redirects them to `/me`; `/leaderboard` nav hidden.

## Trust boundary

- `provisionMemberLogin` is Admin-only (rejects non-Admin; cannot self-provision a
  uid/role). The returned reset link is single-use + time-limited; shown only to
  the Admin. Member PII (email/phone/birthdate) stays private — `/me` reads only the
  member's own doc; the rank reads `memberPoints` (name-free, points-only).
- B1 adds no client write paths; the only privileged write (uid + claim) is the
  admin-SDK callable.

## Deferred (designed-not-out)

- Member self-edit (Member role has `update own`; v1 is read-only).
- Upcoming events (D1) · milestones/birthday (K).
- Proper leaderboard-for-members: denormalize `memberName` + eligibility onto
  `memberPoints` (engine-written) → restores A6 "public to all members".
- Broaden provisioning to Membership; real email delivery of the invite (K).
