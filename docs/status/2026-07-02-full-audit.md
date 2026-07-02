# Full Project Audit — 2026-07-02

Multi-agent audit of the whole monorepo across 8 dimensions: architecture consistency, code duplication, React/data patterns (backstage + spotlight), security (Firestore access layer + beacon functions), UI component consistency, and token/style discipline.

## Method

- **Fleet:** 3 read-only scouts (repo map, UI inventory, security surface) seeded 8 dimension finders; every finding then went through an adversarial verify pass whose default stance was *refute*. Critical/High findings got a 3-lens panel (correctness / security impact / fix-regression risk, at least 2 of 3 must confirm); Medium/Low got one skeptic each. 94 agents total.
- **Result:** 64 findings reported, 55 survived verification, 9 refuted. Severities below are the *panel-adjusted* ones where the verifiers overruled the finder (marked with an asterisk).
- **Caveat:** main advanced mid-run (the authz UX-parity merge touched several audited files). The verify pass read post-merge code, so anything already fixed on main was refuted rather than reported — the survivors below hold against current `main`.
- **Companion PRs:** this report ships with two doc fixes (CLAUDE.md phantom `packages/utils` row, DESIGN.md missing `ink-4`); a second PR (`fix/audit-quick-wins`) applies the small verified fixes marked **QW** below.

## Executive summary

No Critical findings. The codebase is in good shape where it matters most: firestore.rules are default-deny with no client deletes, beacon triggers are idempotent with the known race fixes intact, backstage server state is uniformly on TanStack Query with per-feature key factories, and the auth guard + safe-redirect layer verified clean. The debt is concentrated in four themes:

1. **Trust-the-DB reads.** 13 of 14 backstage repositories map Firestore docs with raw `as Type` casts while matching zod schemas sit unused in `@luminova/types`. Panels downgraded this from High (rules constrain writers, so bad data needs a privileged writer or schema drift) but it remains the top structural item: one shared mapping helper + parse-on-read would erase an entire bug class (a raw-cast crash already happened once on `joinDate`).
2. **Two real Firestore-rules gaps** (both panel-adjusted to Medium, both need a rules PR + /security-review): the `featured` flag is not gated on the projects/programs *create* path, so any create-permission holder can publish to the public showcase; and the activity `category`/`startAt`/`parentId` lock that protects computed points exists only in the client repository, not in the rules.
3. **Missing shared primitives.** The `rounded-card border border-line bg-surface` card shell is hand-rolled in ~41 places; there is no Card primitive, no shared search-input, three pill/badge recipes, one full duplicated feature pair (programs/projects repositories + hooks are token-identical), duplicated photo-CRUD hooks, three `initials()` implementations, and a parallel datetime module in spotlight missing the UTC pin.
4. **A blind spot in CI:** `eslint-plugin-react-hooks` is configured nowhere, so rules-of-hooks/exhaustive-deps violations in the hand-rolled spotlight hooks are invisible.

The user-reported check-in row misalignment was confirmed (scan card ~76px vs search input 52px, top-aligned grid) — verifiers rated it cosmetic and rejected the naive `items-stretch` fix as a regression (the card would balloon when search results render); the quick-wins PR applies a height-matched tile wrapper instead.

## Quick wins (applied in `fix/audit-quick-wins`)

| # | Fix | Files |
|---|-----|-------|
| QW1 | Check-in row alignment: wrap the member-search column in a `p-3 rounded-card border bg-surface` tile so its rest height (12+52+12) equals the scan card's 76px; results grow inside the tile, card stays top-anchored | `check-in/components/manual-tap-list.tsx` |
| QW2 | `text-[#c0392b]` → error token | `allies/components/ally-form.tsx:105` |
| QW3 | `TONE_RIPPLE_COLOR` raw hex → `var(--color-jci-*)` | `activities/lib/category-tone.ts` |
| QW4 | Chart series raw `#0097D7` → `var(--color-jci-blue)` | `components/overview/overview-view.tsx:68` |
| QW5 | Three `initials()` implementations → one exported from `@luminova/ui` | `packages/ui/src/components/avatar.tsx`, `backstage/src/lib/initials.ts`, `spotlight .../team-credits.tsx` |
| QW6 | `header.tsx` direct `clsx` → shared `cn` (only if `cn`/tailwind-merge is already in the spotlight bundle — bundle-budget guard) | `spotlight/src/components/header.tsx` |
| QW7 | Stat numbers `.toLocaleString("es")` → `es-BO` (align with formatES convention) | `initiatives/components/initiative-completed.tsx` |
| QW8 | Inline query keys → per-feature key factory | `members/hooks/use-member-points-by-term.ts` (+1) |
| QW9 | `const all = members ?? []` fresh-identity → stable empty | `routes/_app.members.tsx:63` |
| QW10 | **Bonus bug found while verifying the ink-4 doc drift:** the dark-mode block in `theme.css` never overrides `--color-ink-4`, so `text-ink-4` renders near-invisible dark-on-dark in dark mode (13+ usage files) — add the dark value | `packages/ui/src/theme.css` |

## Prioritized backlog

Ordered by (risk x leverage). Items marked **sensitive** touch firestore.rules/beacon/auth → require /security-review + the matching reviewer subagent + Security-Reviewed trailer.

1. **Rules: gate `featured` on create** (Medium, S, **sensitive**) — mirror the update-path gate on the create path for projects/programs; add rules tests. `firestore.rules:153`.
2. **Rules: enforce activity lock server-side** (Medium, M, **sensitive**) — move the category/startAt/parentId-locked-once-checkins-exist invariant from activity-repository into rules. `firestore.rules:313`.
3. **Beacon hardening trio** (Medium, M, **sensitive**) — (a) `provisionMemberLogin` must not silently overwrite an existing `uid` (orphans old claims); (b) `awardPoints` guard for identity-field updates on checkIns (currently only create/delete branches); (c) `assignedBy` is one per-term field shared by cargo + comisiones, so a permitted self-edit can strip Admin-granted comisión power — needs a design decision (per-grant assignedBy or rules freeze).
4. **Shared Firestore read mapper + parse-on-read** (Medium, L) — one helper for the `{id, ...data}` mapping (9 copy-pastes) + zod `.parse()` on reads using the existing schemas; roll out per-repository. Kills the raw-cast class.
5. **Design-system adoption track** (L) — Card primitive (41 hand-rolled shells, 3 radii), adopt KpiCard/Badge/SegmentedControl where reimplemented, a SearchInput (leading-icon) primitive (4 patterns today), ScanModal → ui Dialog (real focus-trap a11y gap), Ripple default color via CSS var. Batch by component, verify with bundle-budget-watcher.
6. **Backstage density type scale** (M, DS decision) — 24 distinct `text-[Npx]` values across 61 files vs 0 uses of the brand scale; define compact steps (12/13/14/15px) as tokens, then sweep.
7. **programs/projects feature merge** (M) — repositories + hooks are byte-identical modulo naming; fold into one parameterized initiative layer.
8. **Photo stack dedup** (M) — merge use-activity-photos/use-initiative-photos (~90% shared) and the 3 storage upload/delete reimplementations onto photo-storage.ts generics.
9. **Datetime consolidation** (M) — spotlight's parallel module lacks the UTC pin (wrong dates off-UTC); fold spotlight formatters + 7 ad-hoc toLocale* call sites into the parameterized es-BO module per the standing consolidate-when-touched policy; verify each site's intent before pinning (panel flagged fix-risk).
10. **QueryClient defaults** (S, behavior change) — set staleTime/retry/refetchOnWindowFocus policy fitting an admin app; audit per-hook overrides after.
11. **eslint-plugin-react-hooks in CI** (M) — monorepo-wide; expect and triage new warnings.
12. **Spotlight data-layer consistency** (M) — fetchFeatured server-side `featured` query (currently downloads whole collection), generalize the SWR-localStorage cache to showcase/allies, add dev-visible error logging to use-async hooks, route home-programs through use-showcase, unify empty-vs-error rendering.
13. **Detail-route error handling** (M) — stop conflating query error with "no encontrado"; add isError + retry branch. Same class as the known infinite-skeleton gotcha.
14. **Rules/repo drift cleanup** (S, **sensitive**) — `board` + `events` collections exist in rules with no repository consumer; decide remove-or-implement. Also decide whether positions/roles should stay readable to bare Members (RBAC map exposure, Low).
15. **Smaller items** — beacon onRoleWritten unbounded scan limit; getRolesByIds input bound; teamIds dedup; not-found.tsx dedup; storage helpers out of @luminova/firebase into a domain package; memberSchema roleIds/permissionOverrides dead surface trim; overview rounded-[16px] bespoke shells; feature-folder stray root files.

## Roadmap impact

Nothing here changes the feature roadmap. Recommended handling: track items 1-3 as a near-term security-hygiene PR series (small, high-value), and fold items 4-6 into a standing "platform hygiene" track worked opportunistically between features. No roadmap edit made.


## Findings by dimension

### Architecture & behavioral consistency (8/9 survived)

| Sev | Verdict | Where | Finding | Fix size |
|-----|---------|-------|---------|----------|
| Medium | confirmed | `apps/backstage/src/features/programs/repositories/program-repository.ts:21` | programs and projects are duplicate features: their repositories AND all hooks are byte-identical after a Program/Project token swap. | M |
| Medium | confirmed | `apps/backstage/src/routes/_app.activities.tsx:161` | Loading/error/empty states are rendered inconsistently across route pages, including an accessibility regression (role="alert" missing on some error banners). | M |
| Medium | confirmed | `packages/firebase/src/member-photo.ts:8` | Domain-specific storage helpers (member photos, ally logos, initiative/activity photos) live inside the generic @luminova/firebase infra singleton package. | M |
| Low\* | confirmed | `apps/backstage/src/features/members/repositories/member-repository.ts:36` | All 13 repositories hand-roll the same raw-cast Firestore mapping with no runtime validation on read, despite zod schemas existing in @luminova/types. | M |
| Low | confirmed | `CLAUDE.md:24` | CLAUDE.md documents a packages/utils (`@luminova/utils`) package that does not exist; `cn` actually lives in packages/ui. | S |
| Low | confirmed | `apps/backstage/src/features/activities/category-labels.ts:1` | Feature-folder layout is inconsistent: stray root files bypass the components/hooks/repositories/lib convention and two features omit expected subfolders. | S |
| Low | confirmed | `apps/backstage/src/features/members/repositories/member-repository.ts:18` | Repository method naming and the 'who resolves the acting uid' responsibility are inconsistent across repositories. | M |
| Low | confirmed | `apps/beacon/src/index.ts:57` | beacon showcase orchestration (projectShowcase, resolveMembers, ACTIVITY_ROLLUP_CAP) lives inline in index.ts while every other trigger body is a thin delegator to a subfolder. | S |
| Medium | REFUTED | `apps/backstage/src/features/programs/repositories/program-repository.ts:34` | Soft-delete/active-filtering policy diverges per collection with no shared convention. | M |

### Code duplication / shared utilities (10/10 survived)

| Sev | Verdict | Where | Finding | Fix size |
|-----|---------|-------|---------|----------|
| Medium\* | confirmed | `apps/spotlight/src/components/showcase/format.ts:9` | Spotlight's parallel datetime module omits the UTC timezone pin that the canonical backstage module enforces, risking wrong dates for viewers outside UTC. | M |
| Medium | confirmed | `packages/ui/src/components/avatar.tsx:10` | initials() is implemented identically in packages/ui (not exported) and apps/backstage/src/lib/initials.ts, plus a third divergent implementation in spotlight. | S |
| Medium | confirmed | `packages/firebase/src/member-photo.ts:8` | Upload/delete-with-notfound-swallow storage pattern is reimplemented independently 3 times inside the same package instead of reusing the generic helpers already in photo-storage.ts. | S |
| Medium | confirmed | `apps/backstage/src/features/allies/repositories/ally-repository.ts:23` | The Firestore doc-to-domain mapping `{ id: d.id, ...(d.data() as Omit<X, "id">) }` is copy-pasted across 9 repository files with no shared helper. | M |
| Medium | confirmed | `apps/backstage/src/features/initiatives/hooks/use-initiative-photos.ts:13` | use-activity-photos.ts and use-initiative-photos.ts are near-identical (~90% shared logic) hooks for photo CRUD + query invalidation, diverging only in which repository/storage functions they call. | M |
| Low\* | confirmed | `CLAUDE.md:24` | CLAUDE.md's package table documents packages/utils (@luminova/utils) as an existing shared-utility package, but it does not exist in the repo. | M |
| Low\* | confirmed | `apps/spotlight/src/components/not-found.tsx:4` | not-found.tsx is duplicated near-identically between apps/backstage and apps/spotlight (same gradient constant, same copy, same layout intent, ~140 vs ~76 lines). | M |
| Low | confirmed | `apps/backstage/src/features/initiatives/components/initiative-completed.tsx:27` | Backstage formats stat numbers with raw `.toLocaleString("es")` instead of the project's existing es-BO Intl.NumberFormat convention used by spotlight's formatES. | S |
| Low | confirmed | `apps/spotlight/src/components/header.tsx:3` | header.tsx imports clsx directly instead of the shared cn() re-export/pattern used everywhere else, bypassing the project's tailwind-merge conflict resolution. | S |
| Low | confirmed | `apps/backstage/src/features/activities/hooks/activity-keys.ts:1` | TanStack Query key factories are hand-written per feature (10 near-identical files) with no shared factory helper, risking key-shape drift. | S |

### React & data patterns — backstage (5/6 survived)

| Sev | Verdict | Where | Finding | Fix size |
|-----|---------|-------|---------|----------|
| Medium | confirmed | `apps/backstage/src/lib/query-client.ts:21` | QueryClient is built with no defaultOptions — default refetchOnWindowFocus and retry policies are wrong for an admin app reading Firestore. | S |
| Medium | confirmed | `apps/backstage/src/routes/_app.activities_.$id.tsx:118` | Detail routes conflate a query error with 'not found' — a transient/permission read failure renders a misleading 'no encontrado' page with no retry. | M |
| Medium | confirmed | `apps/backstage/src/features/activities/hooks/use-activity-photos.ts:11` | use-activity-photos and use-initiative-photos are near-identical duplicated hooks (addPhoto/removePhotoById/setCover/setCaption + parallel invalidate). | M |
| Low | confirmed | `apps/backstage/src/features/members/hooks/use-member-points-by-term.ts:6` | Two query hooks hardcode inline query keys instead of a per-feature key factory, breaking the repo convention and safe invalidation. | S |
| Low | confirmed | `apps/backstage/src/routes/_app.members.tsx:63` | `const all = members ?? []` produces a fresh array identity while the query is loading, defeating the downstream useMemo dependencies. | S |
| High | REFUTED | `apps/backstage/src/routes/_app.allies.tsx:35` | Mutation error-feedback stragglers: several create/update/delete handlers call mutateAsync with no try/catch and no onError, so failures fail silently with no user feedback. | M |

### React & data patterns — spotlight (6/6 survived)

| Sev | Verdict | Where | Finding | Fix size |
|-----|---------|-------|---------|----------|
| Medium | confirmed | `apps/spotlight/src/showcase/showcase-firestore.ts:21` | fetchFeatured() pulls the entire `showcase` collection over the wire and filters for `featured` client-side instead of using a Firestore query. | S |
| Medium | confirmed | `apps/spotlight/src/showcase/use-showcase.ts:5` | Showcase and allies fetchers have zero caching/revalidation, unlike the SWR-over-localStorage pattern already established for site-config in the same app. | M |
| Medium | confirmed | `apps/spotlight/src/lib/use-async.ts:23` | Both shared async hooks swallow fetch errors completely (no console.error/logging), so a Firestore rules regression or index-missing failure in prod is invisible to devs — only a generic empty/error UI is shown to users. | S |
| Medium | confirmed | `eslint.config.js` | No `eslint-plugin-react-hooks` is configured anywhere in the monorepo, so exhaustive-deps / rules-of-hooks violations in hand-rolled hooks (use-async.ts, use-async-on-visible.ts, header.tsx's scroll listener) are not caught by CI despite CLAUDE.md claiming `react-best-practices` runs on every `.tsx` edit. | M |
| Low\* | confirmed | `apps/spotlight/src/components/home-programs.tsx:51` | home-programs.tsx bypasses the shared use-showcase.ts hook module and hand-wires fetchFeatured + useAsyncOnVisible directly, duplicating logic that use-showcase.ts already centralizes for the immediate (non-deferred) variant. | S |
| Low | confirmed | `apps/spotlight/src/routes/index.tsx:270` | Error-state UX is inconsistent across data-consuming components: /impacto, /programas and /impacto/$id show explicit Spanish retry copy on fetch error, but HomeAllies and HomePrograms (both on the home page) silently render nothing on error, indistinguishable from the legitimate empty-state. | S |

### Security — Firestore access layer (6/6 survived)

| Sev | Verdict | Where | Finding | Fix size |
|-----|---------|-------|---------|----------|
| Medium\* | confirmed | `firestore.rules:153` | CREATE path for projects/programs does not gate the `featured` field, letting any create:Project/Program-permission holder (not just Admin/ProjectManager) directly publish an initiative to the public /programas showcase. | S |
| Medium\* | confirmed | `firestore.rules:313` | Activity `category`/`startAt`/`parentId` locking (required once check-ins exist, to protect already-computed points) is enforced only in the client repository, not in firestore.rules — any direct write bypasses it. | M |
| Low\* | confirmed | `apps/backstage/src/features/members/repositories/member-repository.ts:30` | 13 of 14 backstage repositories read/write Firestore with raw `as Type` casts and zero runtime validation, even though matching Zod schemas exist in @luminova/types; only check-in-repository (write-side) and point-rule-repository (single-field) actually call `.parse()`. | M |
| Low\* | confirmed | `firestore.rules:194` | Two Firestore collections defined in the rules (`board`, `events`) are never touched by any repository in the entire monorepo — `board` is world-readable with no writer, both are rules-vs-repo drift (latent, unused privilege). | S |
| Low | confirmed | `firestore.rules:232` | `positions/{positionId}` and `roles/{roleId}` are readable by any signed-in user, including the bare `Member` role with zero coarse perms — exposing the full cargo→power-grant map and RBAC permission sets to every authenticated account. | S |
| Low | confirmed | `packages/types/src/member-schema.ts:26` | memberSchema declares `roleIds`/`permissionOverrides` as part of the main member form input, but `toMemberCreateDoc`/`toMemberUpdateDoc` never write them — the actual write path is the separate Admin-only MemberPermissionsRepository — creating a misleading schema surface that could lead a future change to wire these fields through the unprivileged member-repository write path. | S |

### Security — beacon Cloud Functions (7/8 survived)

| Sev | Verdict | Where | Finding | Fix size |
|-----|---------|-------|---------|----------|
| Medium\* | confirmed | `apps/beacon/src/index.ts:192` | onMemberWritten resolves termKey from wall-clock now() instead of a stable event-derived value, breaking retry idempotency at term/year boundaries. | S |
| Medium | confirmed | `apps/beacon/src/claims-sync/sync.ts:44` | assignedBy is a single per-term field shared by cargoId and all comisionIds, so a non-Admin's rules-permitted self-edit to a non-power field can silently strip previously Admin-granted comisión power. | M |
| Medium | confirmed | `apps/beacon/src/provision-member-login.ts:74` | provisionMemberLogin unconditionally overwrites members/{id}.uid without checking for a pre-existing uid, orphaning the old Auth account's claims on re-provisioning. | S |
| Medium | confirmed | `apps/beacon/src/index.ts:86` | awardPoints only branches on after/before .exists (create/delete); an update that changes a checkIn's identifying fields (memberId/activityId/role) would orphan the old participation row with no code-level guard. | M |
| Low | confirmed | `apps/beacon/src/index.ts:213` | onRoleWritten does a full unbounded members-collection scan (no .limit()) for any built-in role doc write, even a metadata-only edit that doesn't change permissions. | M |
| Low | confirmed | `apps/beacon/src/award-points/firestore-store.ts:26` | parseInitiativeWrite dedupes coDirectorIds via a Set but leaves teamIds un-deduplicated, an inconsistency vs. the sibling field two lines below. | S |
| Low | confirmed | `apps/beacon/src/claims-sync/firestore-deps.ts:91` | getRolesByIds has no defensive bound on ids.length before calling db.getAll(...refs), unlike getRoleDocsByBuiltInKeys which is naturally capped by the 7-entry ROLES list. | S |
| Low | REFUTED | `apps/beacon/src/provision-member-login.ts:54` | Raw untyped cast of Firestore member data (`snap.data() as { email?: unknown; active?: unknown }`) instead of a shared structural parser like parseMember, inconsistent with the rest of the codebase's validation style. | S |

### UI component consistency (8/10 survived)

| Sev | Verdict | Where | Finding | Fix size |
|-----|---------|-------|---------|----------|
| Medium | confirmed | `apps/backstage/src/features/check-in/components/scan-modal.tsx:98` | ScanModal hand-rolls role=dialog with only initial-focus + Escape + scroll-lock, no focus trap — a real a11y gap vs the Radix-backed ui Dialog. | M |
| Medium | confirmed | `apps/backstage/src/features/members/components/member-status-filter.tsx:16` | MemberStatusFilter reimplements the ui SegmentedControl (identical pill-toggle-group + aria-pressed) instead of adopting it, diverging from InitiativeFilters which does use it. | M |
| Medium | confirmed | `apps/backstage/src/features/check-in/components/check-in-stats.tsx:49` | Local pill/badge spans are hand-rolled in several widgets instead of the ui Badge, duplicating tone recipes. | M |
| Medium | confirmed | `apps/backstage/src/routes/_app.members.tsx:170` | The search-with-leading-icon field is hand-assembled at least 3 times (relative wrapper + absolute icon + DS Input), plus a fake-button variant and DataTable's built-in search = 4 search patterns. | M |
| Low\* | confirmed | `apps/backstage/src/features/initiatives/components/initiative-stat-card.tsx:8` | No Card primitive exists: the 'rounded-card border border-line bg-surface' shell is hand-rolled in ~41 places across ~32 files, with three divergent card radii. | L |
| Low\* | confirmed | `apps/backstage/src/features/initiatives/components/initiative-completed.tsx:24` | InitiativeStatCard and the overview date/stat tiles duplicate the ui KpiCard instead of adopting it. | M |
| Low | confirmed | `apps/backstage/src/components/overview/overview-view.tsx:124` | Overview section cards hard-code rounded-[16px] + a bespoke shadow recipe repeated 4x, diverging from both rounded-card (12px) and KpiCard's rounded-[14px]. | S |
| Low | confirmed | `apps/backstage/src/features/members/components/member-filter-meta.tsx:57` | Text action buttons (e.g. 'Limpiar todo') are raw <button> with ad-hoc link styling instead of the ui Button link variant. | S |
| Medium | REFUTED | `apps/backstage/src/components/page-header.tsx:5` | Two header primitives coexist: app-local PageHeader vs ui SectionHeader, with overlapping but divergent APIs (eyebrow/title/subtitle/actions). | M |
| Low\* | REFUTED | `apps/backstage/src/features/check-in/components/activity-check-in.tsx:125` | Check-in row misaligns because the scan-card CTA is ~76px tall while the adjacent DS Input is locked at 52px, and the grid is top-aligned (items-start). | S |

### Design tokens & style discipline (9/9 survived)

| Sev | Verdict | Where | Finding | Fix size |
|-----|---------|-------|---------|----------|
| Medium | confirmed | `apps/backstage/src/features/check-in/components/scan-modal.tsx:32` | rounded-[Npx] arbitrary radii bypass the rounded-card (12px) token in ~30 places across 20 backstage files, including two spots inside the very same component that also correctly uses rounded-card. | M |
| Low\* | confirmed | `packages/ui/src/components/ripple.tsx:24` | RippleSVG/RippleBackground default to a raw hex color ("#0097D7") instead of the CSS custom property, and ~15 call sites across both apps re-type that same hex (or #FFFFFF/#57BCBC) by hand instead of using a token reference. | M |
| Low\* | confirmed | `apps/backstage/src/components` | Backstage has no UI-density type scale: 24 distinct arbitrary text-[Npx] values (including half-pixel steps like 10.5px/12.5px/13.5px/14.5px) are used across 61 files, vs. 3 uses of Tailwind's built-in text-xs/sm and 0 uses of the DS brand scale (text-display/title/subtitle/quote). | L |
| Low\* | confirmed | `apps/backstage/src/components/overview/overview-view.tsx:68` | Chart series color is a raw hex literal duplicating --color-jci-blue, in the same file that correctly uses jci-blue utility classes elsewhere. | S |
| Low\* | confirmed | `apps/backstage/src/features/activities/lib/category-tone.ts:23` | TONE_RIPPLE_COLOR hardcodes uppercase hex duplicating jci-blue/jci-teal/jci-navy tokens exactly, consumed via both an SVG color prop and a raw style={{background}} in activity-detail-hero.tsx. | S |
| Low | confirmed | `apps/backstage/src/features/allies/components/ally-form.tsx:105` | Error message text color is a raw hex literal (#c0392b) duplicating the already-defined --color-error token, which is used as a semantic class elsewhere in the same app. | S |
| Low | confirmed | `apps/backstage/src/components/not-found.tsx:4` | NUMERAL_GRADIENT and RippleBackground color are duplicated verbatim (byte-for-byte) between apps/backstage and apps/spotlight not-found.tsx, and both hardcode rgba(87,188,188,.85)/#57BCBC which are exact jci-teal duplicates. | M |
| Low | confirmed | `packages/ui/DESIGN.md` | DESIGN.md's token table documents only ink-1/ink-2/ink-3, but theme.css defines a 4th ink token (ink-4) that is real and actively used in 13+ backstage files — a doc-drift gap in the file that's supposed to be the design-system ingest manifest. | S |
| Low | confirmed | `apps/backstage/src/features/members/lib/member-display.ts:4` | avatarColor's 10-hue hash palette has one entry (#1F4789) that coincidentally equals --color-jci-navy exactly, while the rest are arbitrary non-brand hues, with no comment distinguishing intentional-palette-breadth from a stray token duplicate. | S |

## Refuted findings (why they died)

Nine findings were killed by the adversarial pass — worth recording so they aren't re-reported:


- **architecture** — Soft-delete/active-filtering policy diverges per collection with no shared convention. `apps/backstage/src/features/programs/repositories/program-repository.ts`
  - The differing per-collection behavior is real but is a deliberate, documented, rules-enforced two-tier policy, not ad-hoc drift. docs/data-models.md's permission-matrix table explicitly lists delete authority per collection: members/positions/allies/roles are 'never (soft-delete only)' — living roster entities with active/deletedAt — while programs/projec…
- **react-backstage** — Mutation error-feedback stragglers: several create/update/delete handlers call mutateAsync with no try/catch and no onError, so failures fail silently with no user feedback. `apps/backstage/src/routes/_app.allies.tsx`
  - The finding's mechanism is false. Every cited handler passes its async fn as the onSubmit prop to a form component (AllyForm, PositionForm, MemberForm, MemberPositionsForm, RoleEditor), and each form wraps `await onSubmit(data)` in its own try/catch that renders a role="alert" inline error and keeps the Sheet open (ally-form.tsx:49-56, member-form.tsx:117…
- **security-beacon** — Raw untyped cast of Firestore member data (`snap.data() as { email?: unknown; active?: unknown }`) instead of a shared structural parser like parseMember, inconsistent with the rest of the codebase's validation style. `apps/beacon/src/provision-member-login.ts`
  - Read provision-member-login.ts (lines 45-59): the `snap.data() as {email?:unknown; active?:unknown}` cast is immediately followed by full typeof/value guards before member.email/member.active are used, so there's no unchecked-access bug (the finder concedes this). The core claim of a style violation doesn't hold: grepping apps/beacon/src shows the same 'i…
- **ui-components** — Check-in row misaligns because the scan-card CTA is ~76px tall while the adjacent DS Input is locked at 52px, and the grid is top-aligned (items-start). `apps/backstage/src/features/check-in/components/activity-check-in.tsx`
  - Geometry is accurate (button ~76px via px-5 py-4 + size-11 badge; DS Input pinned h-[52px]; grid uses items-start), but this is a subjective aesthetic preference, not a correctness defect — top-aligned unequal-height cells render as designed with no breakage. ManualTapList's own doc comment ("the field sits quietly next to the scanner until it's needed") …
  - *Overridden by the design owner:* the user explicitly asked for this alignment, so QW1 fixes it anyway — with the tile-wrapper approach, since the panel's regression objection to `items-stretch` (card ballooning next to a tall result list) was valid.
- **ui-components** — Two header primitives coexist: app-local PageHeader vs ui SectionHeader, with overlapping but divergent APIs (eyebrow/title/subtitle/actions). `apps/backstage/src/components/page-header.tsx`
  - grep confirms PageHeader is used exclusively across ~11 backstage routes/overview-view (app-local, not exported from packages/ui or DESIGN.md), while SectionHeader is used only in apps/spotlight (index.tsx, about.tsx) and never in apps/backstage. So there is no actual instance of both headers coexisting or producing inconsistent output within the admin — …

## Coverage notes (per finder)

- **architecture**: Swept: all 14 backstage feature folders + their 23 repository files, all 60+ hooks, route pages for loading/error/empty handling, beacon/src layout (index.ts + award-points/claims-sync/showcase subfolders), packages/{ui,firebase,types,auth} boundaries. Verified seeds: packages/utils genuinely does NOT exist (cn is in packages/ui/src/lib/cn.ts) — CLAUDE.md is wrong; beacon is NOT a flat index — triggers are thin delegators to subfolders (only showcase orchestration leaks into index.ts). Confirmed programs/projects are full duplicates (repos+hooks token-identical). Deliberately EXCLUDED cross-app spotlight-vs-backstage paradigm split (free-function fetchers, firestore/lite, semantic CSS) per instructions — it is an intentional bundle-budget decision. Did NOT deep-audit spotlight's internal consistency or packages/types zod schema shape (out of dimension / covered by other auditors). Dro…
- **react-backstage**: Swept: src/lib/query-client.ts; all 29 useMutation hooks + their call sites (routes + feature components) for onError/try-catch coverage; all 51-ish useQuery hooks; every route's isLoading/isError/!data guard; re-render surfaces (AbilityProvider context value, useAuth useSyncExternalStore stability, MemberTable/DataTable memo + inline props, key/columns memoization); the scan-modal effect cleanup; route-loader/component waterfalls. VERIFIED-CLEAN (not reported): AbilityProvider ability/claims identity is stable because useAuth returns a single store `state` ref via useSyncExternalStore and decodeClaims runs once per token (no re-render trap); MemberTable is not React.memo so its inline onView/emptyState/rowActions props don't break memoization and columns are correctly useMemo'd; member-roles-panel.tsx DOES surface save.isError (excluded from the stragglers finding); useInitiativesByT…
- **security-firestore**: Swept: firestore.rules (full 419 lines) against all 14 apps/backstage repositories; member/activity/initiative/position/role/ally/site-config mappers; packages/types schemas (member, site-config, check-in, position, role-definition); beacon claims-sync (sync.ts, compute-roles.ts, resolve-member-perms.ts) and index.ts triggers to verify what the `roles` vs `perms` custom claims actually contain (needed to disprove the rules' `hasAnyRole(['Admin','ProjectManager'])` comment assumption); apps/backstage/src/lib/auth/{guard,safe-redirect}.ts and _app.tsx beforeLoad guard (clean, well-tested, no findings); use-can.ts UI-authz mirror; spotlight showcase consumer to confirm the `featured` bypass has real public-facing impact.

Confirmed-clean / not re-reported (already known-good or explicitly out of scope per seed): member-repository/ally-repository active==true filtering; members-collection…
- **security-beacon**: Swept: apps/beacon/src/index.ts (all 7 exported triggers), callable-auth.ts, set-user-roles.ts + test, provision-member-login.ts + test, seed-roles.ts, recompute-claims.ts, runtime.ts, all of claims-sync/* (sync, parse-member, resolve-member-perms, compute-roles, firestore-deps), all of award-points/* (check-in, process, derive, derive-roster, aggregate, firestore-store, ids, participation-id, store types via usage), showcase/project-initiative.ts + project-ally.ts, firestore-util.ts, package.json (deps/runtime), firebase.json runtime line, and the relevant firestore.rules sections (checkIns, participations/memberPoints, showcase/allyShowcase, positions/roleIds/permissionOverrides gates) to reason about the beacon-side trust boundary. Confirmed clean: no client-SDK (`firebase/*`) imports anywhere in apps/beacon; Node 24 pinned in both package.json engines and firebase.json runtime; tr…
- **ui-components**: Swept: packages/ui barrel + primitives (Input, Button, IconButton, Badge, Dialog, SectionHeader, SegmentedControl, KpiCard) and every backstage component flagged in the seeds plus a repo-wide grep for the card shell (41 hits/32 files) and bg-jci-blue usages (12 files). Verified the priority check-in alignment finding by tracing intrinsic heights (scan card ~76px vs Input h-[52px]). Confirmed no Card primitive exists in index.ts. Confirmed MemberStatusFilter duplicates SegmentedControl by reading both. Dropped/merged to stay under cap: (a) the 3 divergent card radii were folded into the Card and overview findings rather than a separate item; (b) individual raw-button sites in collapsible-section.tsx and field-array-rows.tsx were judged legitimately bespoke (disclosure toggle, dashed add-row) and not reported; (c) app-topbar's fake-search button folded into the SearchInput finding; (d) …
