# Public member profile

## Shipped

- `memberShowcase/{memberId}`: a beacon-written, get-only public projection of a member's
  career and projects, gated by the same consent as the board, without the cargo and photo gates.
- `onShowcaseWritten`: a retrying trigger that keeps project lists current.
- `onProgramShowcaseWritten` / `onProjectShowcaseWritten`: retrying triggers that project
  `showcase` from the live initiative, so a failed takedown is redelivered.
- `reprojectPublicProfiles`: an Admin callable that backfills `showcase` member ids and every
  profile.
- Spotlight: a lazy modal driven by `?miembro=<id>`, opened from the Directiva and team credits.
- `/me`: `bio` and `linkedinUrl`, on the member's own lane only.

## Verification

- `pnpm pr-tests` passed.
- Emulator run: the backfill, a project removal and an opt-out each changed the projection as
  specified. Anonymous `list` on `memberShowcase` returned 403.
- Headless Chrome: desktop, phone, short card, unavailable state and a real image.

## Decisions

- A member needs a `uid` to get a profile, so the `/me` opt-out is always reachable.
- Left out: email, phone, birthdate, points, attendance and Best Member.
- Admins cannot edit `bio` or `linkedinUrl`. The remedy for an abusive one is the takedown, and
  an active member can turn their profile back on at `/me`. A lock would need a new Admin-only
  field.
- `isPastPresident` is Admin-only, because it is now a public badge.

## Deferred

- `publicProfile: true` was collected for the Directiva. The backfill extends it to the whole
  profile, for non-board members too. The new `/me` copy reaches members only when they open it.
- The privacy page says membership data is not managed from the public site. Review it now that
  profiles are public.
- Owner run after deploy: `reprojectPublicProfiles`.
- Docs without `publicProfile` (created before 2026-08) stay unpublished until the member opts in
  on `/me`.
- No backstage form sets `isPastPresident` or `terms.bestMemberId`.
- `showcase.memberIds` and `ShowcasePerson.id` are public, and the member id is also the QR
  check-in payload. A forged QR still needs a Scanner and an open check-in.
