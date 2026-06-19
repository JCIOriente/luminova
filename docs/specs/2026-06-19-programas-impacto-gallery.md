# Spec — Curated `/programas` + rich `/impacto` gallery

**Date:** 2026-06-19
**Status:** Approved (brainstorming complete)
**Branches:** `feat/programas-impacto-backend` (PR1) → `feat/programas-impacto-frontend` (PR2, stacked)

## Problem

The Spotlight "programas" surface is five hard-coded static marketing cards on the
homepage; there is no data-driven page for completed programs/projects. The
`/impacto` showcase lists all finalized initiatives but its photo gallery is a flat
CSS grid with no lightbox, and team credits are name-only text with no photos.

We want:
1. A curated **`/programas`** page showing only "favorite" (featured) programs &
   projects, with `/impacto` remaining the full archive of all completed work.
2. A real **lightbox** on the `/impacto` detail gallery — modal per photo, mobile +
   desktop navigation.
3. **Team photos** (director, co-directors, members) presented in a modern,
   professional way, with an initials fallback when a photo is missing.

## Decisions (locked in brainstorming)

| # | Decision |
|---|----------|
| 1 | `/programas` is a **new route**; homepage keeps its static brand cards but its CTA/nav points to `/programas`. |
| 2 | `/programas` = featured only. `/impacto` = **full archive** (all completed, featured included). |
| 3 | "Favorite" = a boolean **`featured`** flag on the initiative, admin-toggled ("Destacado"). Featured items sort newest-first. |
| 4 | **All** team people (director, co-directors, members) get a photo avatar; missing photo → **initials monogram** fallback. |
| 5 | Lightbox library: **`yet-another-react-lightbox`** (React 19 + TS native; mobile swipe, desktop arrows + keyboard; Zoom/Thumbnails/Captions/Fullscreen plugins). Version vetted via `secure-dep-vetting` before install. |
| 6 | Two **stacked PRs**: PR1 backend foundation, PR2 frontend. |
| 7 | `/programas` cards reuse the existing **`/impacto/$id`** detail page (no duplicate detail route). |

## Data model (`packages/types/src/engine`)

- `InitiativeCore` (`initiative.ts`): add `featured: boolean`. Clients create it as
  `false` (mirrors how `directionUids` is created as `[]`).
- `initiativeFormSchema` (`initiative-schema.ts`): add `featured: z.boolean()` with a
  `.default(false)` so existing callers/forms stay valid.
- `ShowcaseItem` (`showcase.ts`): add `featured: boolean`.
- `ShowcasePerson` (`showcase.ts`): add `photoUrl: string | null`.

## PR1 — backend foundation (`feat/programas-impacto-backend`)

### types
The four type/schema changes above.

### beacon (`apps/beacon`)
- `index.ts` `resolveMemberNames` → widen to resolve a `{ name, photoUrl }` record per
  member id (read `members/{id}.profilePicture` alongside `name`; rename to
  `resolveMembers`). Return `Map<string, { name; photoUrl }>`.
- `project-initiative.ts`:
  - `person()` resolver signature widens: `resolve(id) => { name; photoUrl } | null`,
    producing `{ name, photoUrl }`.
  - `projectInitiative` projects `featured: data.featured === true`.
- **Tests** (`project-initiative.test.ts` or sibling): `featured` projected true/false;
  `photoUrl` resolved when present and `null` when the member has no `profilePicture`.

### backstage (`apps/backstage`)
- `initiative-form.tsx`: add a "Destacado" `Checkbox` (Controller-bound), reusing
  `@luminova/ui` `Checkbox`.
- `initiative-mapper.ts`: include `featured` in `toInitiativeCreateDoc` (as
  `data.featured`) and `toInitiativeUpdateDoc`.

### firestore.rules — **featured is Admin/ProjectManager-only**
The initiative update rule is otherwise permissive and `isDirection()` lets a
director edit their own initiative. `featured` is a public-curation decision (it
promotes an already-public finalized item onto `/programas`), so a self-promoting
director is an unwanted escalation of *curation* authority. Add a field-level guard
(mirroring the existing `positions`/`profilePicture` `affectedKeys` pattern): a
writer who is **not** Admin/ProjectManager must leave `featured` unchanged. This is
the security-review focal point for PR1.

> CREATE-path note (per repo lesson "audit CREATE rules too"): the create rule must
> also forbid a non-Admin/PM creator from setting `featured: true` (only Admin/PM may
> create a featured initiative; everyone else creates with `featured == false`).

### PR1 reviews (feature-flow phase 3)
`/simplify` → `/code-review` → `/security-review` (touches beacon + firestore.rules)
→ dispatch `firebase-functions-reviewer` + `firestore-security-reviewer`. Stamp
`Security-Reviewed: <sha>` so the PR gate passes.

## PR2 — frontend (`feat/programas-impacto-frontend`, stacked on PR1)

### dependency
`yet-another-react-lightbox` added to `apps/spotlight` via `secure-dep-vetting`.

### `/programas` route (`apps/spotlight/src/routes/programas.index.tsx`)
- Reader: extend `showcase-firestore.ts` with `fetchFeatured()` (filter
  `featured === true`, newest-first) — client-side filter over the existing read is
  fine at this collection size; no composite index needed.
- Renders the showcase card component (reused from `/impacto`), cards link to
  `/impacto/$id`.
- Homepage (`routes/index.tsx`) + nav: point the programas CTA/link at `/programas`.

### `/impacto` detail gallery (`components/showcase/photo-gallery.tsx`)
- Thumbnail grid → on click open `yet-another-react-lightbox` with Zoom, Thumbnails,
  Captions, Fullscreen. `ShowcasePhoto.caption` → slide caption. Keyboard + swipe.

### team credits redesign (`components/showcase/team-credits.tsx`)
- Photo avatars for all people; director emphasized; co-directors + members in a
  modern roster layout. Initials monogram fallback when `photoUrl` is null.
- Aesthetic pass: `frontend-design` (vision) → `ui-ux-pro-max` (palette/type/a11y).

### PR2 reviews
`/simplify` → `/code-review` → `/security-review` (new dep + public surface) →
`bundle-budget-watcher` (new dep + new route). `secure-dep-vetting` already gates the
dep. Stamp if any sensitive path is touched (none expected → gate may not require it).

## Testing strategy

- **types**: `pnpm typecheck` (schema/interface compile across consumers).
- **beacon**: vitest unit — featured projection + photoUrl resolve/null.
- **backstage**: form renders + writes `featured`; existing initiative tests stay green.
- **spotlight**: `fetchFeatured` filter; gallery + team-credits render (component test
  where the harness supports it).
- **gate**: `pnpm pr-tests` after each PR.

## Out of scope / deferred

- Manual ordering of featured items (decided: newest-first only).
- A dedicated `/programas/$id` detail route (reuse `/impacto/$id`).
- Replacing the homepage brand cards (kept as marketing).
- Backfill of `featured` on existing initiatives — defaults to `false`; admins opt in.

## Open risks

- `members.profilePicture` field shape — confirm it's a URL string (vs an object)
  during PR1 implementation before mapping to `photoUrl`.
- Field-level `featured` rule must not break existing initiative-update flows for
  Admin/ProjectManager — covered by the rules test suite.
