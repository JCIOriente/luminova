# B1 — Member home (status)

_Date: 2026-06-06 · Branch: `feat/member-home` · Roadmap: B1 (+ a thin slice of B2)_

## Shipped

Members can now log in and see their own recognition data; Admins invite them.

- **beacon `provisionMemberLogin`** (Admin-guarded `onCall`): find/create the
  member's Auth user by email → merge the `Member` role claim (additive, never
  clobbers) → write `members/{id}.uid` (admin SDK) → return a password-reset link
  the Admin relays out-of-band. Idempotent; tolerates concurrent create.
- **`@luminova/firebase`** exposes a `Functions` instance (+ emulator wiring :4020).
- **`@luminova/types`** — `Member` gains optional `uid?` (field already in
  data/rules; now first-class + written by the callable).
- **backstage `/me`** (role-aware home): `MemberPointsSummary` (extracted, shared
  with the A5 profile) + personal QR + `ParticipationLedger` + own rank
  ("Puesto por puntos · N de M", from `pointsRank` over `memberPoints`).
- **Routing/nav**: member-only users are redirected `/` → `/me`; "Mi panel" nav
  added; `/leaderboard` nav gated off plain Members (new `roles` allowlist axis;
  `navItemForPath` fixed to match on path boundaries so `/me` no longer shadows
  `/members`).
- **Provisioning UI**: Admin-gated "Invitar acceso" / "Reenviar acceso" on the
  member profile → calls the callable → shows the reset link in a Dialog (copy).
- **`firestore.rules`** — UNCHANGED (member reads already permitted; `uid` written
  by the admin-SDK callable).

## Verification

- Unit/integration: beacon 40, backstage 106, @luminova/types 47, @luminova/firebase
  5, @luminova/auth 16, @luminova/ui 8 — all green. Prettier + knip clean; audit =
  1 moderate (pre-existing I5).
- **Security**: `/security-review` clean (no findings ≥8). `firebase-functions-reviewer`
  ran — fixed in-branch: concurrent-create race (H2), `active===true` guard (M1),
  email type-check (M2), canonical Auth email for the link (M4), valid-role filter
  on claim merge (L1).
- **Emulator e2e (NEW)**: `tools/scripts/e2e-provision-member.mjs` vs the live
  functions emulator — unauthenticated call rejected (UNAUTHENTICATED); Admin call
  returns the reset link; `member.uid` + `Member` claim set; re-invite idempotent
  (same uid). PASS.

## Decisions / notes

- **Rank is by points only** (no eligibility exclusions) and reads `memberPoints`
  alone — the official eligibility-filtered A6 leaderboard stays board/admin-only
  (its nav is hidden from plain Members) because A6 reads all member docs, which a
  plain Member can't. See deferred fix below.
- **No self-provision guard** on the callable (unlike `setUserRoles`): adding
  `Member` is additive-only (never removes Admin), and an Admin who is also a
  chapter member may legitimately want their own `/me`. Not an escalation.

## Deferred (designed-not-out)

- **Proper leaderboard-for-members**: denormalize `memberName` + eligibility flags
  onto `memberPoints` (engine-written) so A6 serves members again without reading
  member PII. Until then `/leaderboard` is hidden from plain Members.
- Member self-edit (Member role has `update own`; v1 is read-only).
- Upcoming events (D1) · milestones/birthday (K).
- Broaden provisioning to Membership; real email delivery of the invite (K).
- Extract `provisionMemberLogin` orchestration behind an injectable port for unit
  tests (currently covered by the emulator e2e + pure-helper unit tests).
