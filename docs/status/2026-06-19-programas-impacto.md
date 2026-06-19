# Status — Curated /programas + rich /impacto gallery

**Date:** 2026-06-19
**Spec:** `docs/specs/2026-06-19-programas-impacto-gallery.md`
**PRs:** #77 (backend, base `main`) ← #80 (frontend, base `feat/programas-impacto-backend`, stacked)

## Shipped

### PR #77 — backend foundation (`feat/programas-impacto-backend`)
- **types**: required `featured: boolean` on `InitiativeCore` + `initiativeFormSchema`; `featured` on `ShowcaseItem`; `photoUrl: string | null` on `ShowcasePerson`.
- **beacon**: `resolveMembers` projects `members.profilePicture` as an **https-only** public `photoUrl`; projects `featured`; pure `showcasePerson()` helper (drops blank names + non-https photos).
- **backstage**: "Destacar" checkbox on the initiative form; mapper persists `featured`; `initiativeToInput` defaults absent `featured` → `false` (keeps pre-feature docs editable).
- **firestore.rules**: `featuredUpdateSafe()` — only Admin/ProjectManager may change `featured` (absent treated as `false`, fail-closed); create already Admin/PM-only.

### PR #80 — frontend (`feat/programas-impacto-frontend`)
- New `/programas` route: curated featured grid (newest-first), cards → `/impacto/$id`; nav + footer link here.
- `/impacto` gallery → `yet-another-react-lightbox` (zoom/thumbnails/captions/fullscreen, mobile swipe + keyboard).
- Team credits redesigned: photo-avatar roster + initials-monogram fallback.
- `ShowcaseCardGrid` extracted; dep `yet-another-react-lightbox ^3.32.0`.

## Verification

- **beacon** 129 tests · **firestore-rules** 147 (incl. featured gate, programs deny, legacy-echo regression, showcasePerson https/empty-name) · **backstage**/**types** green · **spotlight** 12.
- typecheck 11/11 · lint clean · spotlight vite build OK.
- Reviews: `/simplify`, `/code-review` (caught a CRITICAL forged-`featured` legacy-doc break in #77 and a Rules-of-Hooks bug in #80 — both fixed), `firestore-security-reviewer` (SHIP), `firebase-functions-reviewer` (M1 empty-name + L1 https filter — fixed), `ui-ux-pro-max` (a11y), `bundle-budget-watcher` (lightbox isolated to `impacto.$id` chunk, 57 kB; `/programas` 1.9 kB), `/security-review` (clean on both).
- #77 security-stamped (`Security-Reviewed: 85f66d0`); gate passed on both PRs.

## Decisions

- `/programas` = featured only; `/impacto` = full archive (featured included).
- `featured` made **required** in type/schema; read boundaries default absent → false.
- Monogram fallback uses **solid navy** (#1f4789, ~8.9:1) — the blue/teal brand stops fail WCAG AA on white text.
- Lightbox left **route-split** (not `React.lazy`) — bundle-budget-watcher confirmed it never reaches the main bundle.

## Deferred / open

- **`pnpm pr-tests` not fully run locally**: the firestore-rules emulator suite needs port 4010, held by an active dev emulator — rules verified on an isolated port (4011) instead. Pre-existing `audit` HIGH (`undici` GHSA-vmh5-mc38-953g, transitive via firebase) + knip "redundant entry pattern" config noise are NOT introduced here.
- No `size-limit` config exists repo-wide (CLAUDE.md mentions it; never wired) — separate item.
- Homepage hero "Ver nuestros programas" still scrolls to the on-page `#programas` brand section (kept intentionally); nav/footer route to the new page.
- Merge order: **#77 first**, then #80 (auto-retargets to `main`).

## Handoff prompt (next session)

> Worktrees: `.worktrees/programas-impacto-backend` (#77) and `.worktrees/programas-impacto-frontend` (#80, current branch `feat/programas-impacto-frontend`). Both PRs open and green. Next: get #77 reviewed/merged to `main`, confirm #80 retargets, then merge #80. Re-verify the current branch before any commit (shared working tree). If touching rules again, re-run the rules suite on an isolated emulator port (4010 is taken by a dev emulator) and re-stamp `Security-Reviewed`.
