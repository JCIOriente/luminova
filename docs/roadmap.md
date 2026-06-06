# JCI Oriente — Product Roadmap

Living doc. Each item is a self-contained workstream: brainstorm → plan → TDD →
PR, one at a time or in parallel where dependencies allow. Update statuses as
items land. `[P]` = parallel-safe (no shared files with other open tracks),
`[S]` = sequential (has a dependency, noted).

_Last synced: 2026-06-06, after PRs #4/#5/#6/#7/#8 merged to `main`._

## Done (baseline)

- Monorepo harness (Turbo + pnpm + TS strict + eslint/prettier/knip), Claude tooling.
- **Spotlight** public marketing site (Tailwind v4 + design tokens; images still placeholders).
- **@luminova/ui** shared primitives (bespoke + Radix Tooltip/Dialog/Sheet; Table; Badge/KpiCard/Sparkline/LineChart/Skeleton/EmptyState/admin icons).
- **@luminova/firebase** singleton + emulator wiring; **firebase.json/.firebaserc** (2 hosting sites).
- **Backstage**: bootstrap + auth foundation, **Members CRUD**, **Allies CRUD**, **UI uplift** (shell + Overview + restyled tables).
- **Beacon**: `awardPoints` trigger scaffold (throws "not implemented").

---

## A. Security & data hardening — HIGH (pre-launch blockers)

Coarse `read, write: if isSignedIn()` on members/events/pointRules/allies means any
authed client can hard-delete docs and overwrite aggregation-owned fields. Must
close before any real launch. None are live yet, so no migration pressure.

| # | Item | Dep | Parallel | Triggers |
|---|------|-----|----------|----------|
| A1 | `firestore.rules` hardening: `allow delete: if false` + field-level write guards (block `totalPoints`/`active`/`deletedAt` from client) across members/events/allies/pointRules, with rules tests | — | `[P]` | `/security-review` + `firestore-security-reviewer`; needs Java for emulator tests (`PATH="/opt/homebrew/opt/openjdk/bin:$PATH"`) |
| A2 | Soft-delete write-guard: `update()`/`softDelete()` in **both** Member & Ally repos need a pre-flight existence/`active` check; add try/catch to route `handleSubmit`/`confirmDelete` | — | `[P]` | `/security-review` + `firestore-security-reviewer` |
| A3 | Confirm-or-restrict public read on `projects`/`board` (leftover from spotlight) | — | `[P]` | `/security-review` |
| A4 | Replace real (public) keys in `apps/*/.env.local.example` with placeholders | — | `[P]` | — |
| A5 | App Check enforcement ON (after reCAPTCHA keys provisioned) | infra keys | `[S]` | `/security-review` |

## B. @luminova/ui widget gaps (unblock features)

Complex admin widgets deferred during bootstrap. Build to JCI tokens (Radix where
accessibility matters, like the existing Tooltip/Dialog/Sheet).

| # | Item | Dep | Parallel | Notes |
|---|------|-----|----------|-------|
| B1 | **Combobox** (single-select + search) | — | `[P]` | Blocks Events (director select) |
| B2 | **Multi-select with search** | B1 (shared popover/list) | `[S]` | Blocks Events (co-directors/participants) |
| B3 | **Command palette** primitive | popover | `[P]` | Blocks ⌘K (D2) |
| B4 | **Popover** primitive | — | `[P]` | Shared by B1/B2/B3, avatar/notif menus |
| B5 | Reusable **DataTable** (sort/filter/paginate/skeleton) — refactor target once a 3rd table exists | — | `[P]` | Optional; consolidates Members/Allies/Events tables |

## C. Backstage admin features (CRUD)

Follow `backstage-feature-scaffold` (repository + TanStack Query + RHF/Zod + route).

| # | Item | Dep | Parallel | Notes |
|---|------|-----|----------|-------|
| C1 | **Events CRUD** | B1, B2 | `[S]` | Conditional `parentId` when type = `Activity`; director/co-director/participant selects |
| C2 | **Point Rules** matrix | — | `[P]` | Standalone collection; feeds `awardPoints` (E1) |
| C3 | **Projects** CRUD | — | `[P]` | Simple CRUD; design has progress bars |
| C4 | **Reports** | C1, C2 + data | `[S]` | Needs members/events/points data to chart/export |
| C5 | **Communications** | external (email) | `[S]` | Larger; likely needs a backend/email integration — scope before committing |
| C6 | **Settings** page (real, replaces placeholder) | — | `[P]` | Profile + theme + org settings |

## D. UI uplift follow-ons (deferred, mostly no backend)

| # | Item | Dep | Parallel | Notes |
|---|------|-----|----------|-------|
| D1 | **Dark mode** | — | `[P]` | `[data-theme=dark]` token override + toggle + persistence; components already hex-free/dark-ready |
| D2 | **⌘K command palette** | B3 | `[S]` | Topbar search affordance already in place (inert) |
| D3 | **Sidebar collapse** | — | `[P]` | Structure is collapse-ready; add toggle + icon-only state |
| D4 | Replace mock-only Overview widgets with real data as backends land | C1/C2/C3 | `[S]` | `overview-mock.ts` is the seam; KPIs/chart/upcoming-events/activity |

## E. Beacon (Cloud Functions)

| # | Item | Dep | Parallel | Triggers |
|---|------|-----|----------|----------|
| E1 | `awardPoints` real logic (currently throws) | C1, C2 (event + point-rule model) | `[S]` | `/security-review` + `firebase-functions-reviewer` |
| E2 | `memberPoints` aggregation path-segment validation | E1 | `[S]` | `firebase-functions-reviewer` |
| E3 | Functions deploy packaging for pnpm workspace | — | `[P]` | — |

## F. Media / Storage

| # | Item | Dep | Parallel | Notes |
|---|------|-----|----------|-------|
| F1 | `profilePicture` upload (Storage uploader + storage emulator) for Members | — | `[P]` | Currently `null` |
| F2 | Ally logos (greyscale→color on hover per design) | F1 (uploader) | `[S]` | — |
| F3 | Spotlight real images (replace `ImgSlot` placeholders) | — | `[P]` | Needs real chapter photos |

## G. Shared types & codegen

| # | Item | Dep | Parallel | Notes |
|---|------|-----|----------|-------|
| G1 | Create **@luminova/types** package; promote `Member`/`Ally`/`Event` types when beacon consumes them | — | `[P]` | Currently types are app-local; do before E1 so beacon shares them |
| G2 | Codegen-drift CI gate for shared schemas (regenerate + fail on diff) | G1 | `[S]` | Cross-cutting discipline in root CLAUDE.md |

## H. Infra / deploy / CI

| # | Item | Dep | Parallel | Notes |
|---|------|-----|----------|-------|
| H1 | Storage wipe (manual Firebase Console delete) | — | `[P]` | Pending from rewrite |
| H2 | Java available in CI so `firestore-rules-tests` runs (currently skipped locally) | — | `[P]` | Unblocks A1's tests in CI |
| H3 | First prod deploy (hosting + functions) | A* done | `[S]` | Gate on security hardening |
| H4 | Bump the 1 moderate Dependabot advisory on `main` | — | `[P]` | `secure-dep-vetting` |

---

## Suggested parallel tracks (start now)

These four tracks touch disjoint files and can run concurrently:

1. **Security track** — A1 → A2 → A3 → A4 (highest priority; pre-launch blocker).
2. **UI track** — D1 (dark mode) and D3 (sidebar collapse) are self-contained.
3. **Widgets→Events track** — G1 (types) ∥ B4/B1 → B2 → C1 (events) → E1 (awardPoints).
4. **Standalone CRUD** — C2 (point rules) or C3 (projects) need no new widgets.

**Recommended first move:** the **Security track (A1+A2)** — it's the only pre-launch
blocker and is independent of everything else. In parallel, **D1 (dark mode)** is a
satisfying, low-risk follow-on to the UI uplift that shares no files with the
security work.

Pick an item, run `superpowers:brainstorming` (after `prompt-refine`), and branch
off `main`.
