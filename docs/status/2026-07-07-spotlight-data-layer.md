# Handoff — Spotlight data-layer consistency (audit item 12)

Date: 2026-07-07
Branch: `feat/spotlight-data-layer`
Spec: `docs/specs/2026-07-07-spotlight-data-layer-design.md`
Audit: `docs/status/2026-07-02-full-audit.md` row 53 (item 12) + detail rows 109/110/113.

## What shipped

A consistency + perf refactor of the public spotlight reads. Behavior-preserving
for the user in the happy path, with two intended real changes and one bug fix
surfaced by review.

### Design decisions (confirmed with user before code)

| # | Decision | Rationale |
|---|----------|-----------|
| A | **SWR = match site-config (no TTL)** | Cache paints instantly for first paint, network always revalidates once per load, fresh replaces state. Consistent across all three consumers; president content edits appear next load. |
| B | **Featured query = server-side `where` + client sort** | `query(collection,where("featured","==",true))`. Single-field equality → auto-indexed, so **no composite index, no `firestore.indexes.json` change, no deploy, no rules change, no security gate, no emulator CI job.** `completedAt` sort stays client-side. Downloads only featured docs regardless of collection size. |
| C | **Home-section SWR = paint cached instantly, defer network** | The two below-fold home sections paint cached content on mount (already-downloaded bytes, zero network); the revalidation network read still waits until the section scrolls into view. |

### Data-fetch shape: before → after

- `fetchFeatured`: `getDocs(collection("showcase"))` + `.filter(it=>it.featured)` → `getDocs(query(collection("showcase"), where("featured","==",true)))` + `sortByCompletedDesc`. **Stops downloading the whole (unbounded-growing) `showcase` collection on the public home.**
- `showcase` list / `featured` / `allies`: cold fetch every visit → SWR-over-localStorage (instant cached paint, revalidate once). Showcase caches store Timestamps as **millis** and revive via `Timestamp.fromMillis` (JSON round-trip is version-fragile).
- `siteConfig`: bespoke cache/`inflight` → the shared `makeResourceCache` + `dedupe` primitive (behavior-identical).
- home-programs + HomeAllies: hand-wired `useAsyncOnVisible(fetchX)` **bypass** → routed through `useFeaturedListOnVisible()` / `useAlliesOnVisible()`. Deferred-on-visible network read **preserved**.

### New modules

- `lib/cached-resource.ts` — `makeResourceCache<T>({key,serialize?,revive?})`, `dedupe(fn)`, `withCache(cache,fetcher,label)` (write-through + DEV-only error log).
- `lib/use-cached-async.ts` — `useCachedAsync` / `useCachedAsyncOnVisible`, both composing the item-11 `useAsync` / `useAsyncOnVisible` via one `useCached` HOC. Compose (not edit) so the item-11 hooks (open in PR #142) stay consumed — no orphan, no conflict.
- `allies/use-allies.ts` — `useAlliesOnVisible()` (identity cache, allies are Timestamp-free).
- `test/mock-storage.ts` — shared localStorage stub.

## Empty-vs-error unification

| Site | loading | error | empty | notes |
|------|---------|-------|-------|-------|
| `programas.index` | skeleton | distinct error copy | distinct empty copy | unchanged (reference shape) |
| `impacto.index` | skeleton | distinct error copy | **added** distinct empty copy | now at route-page parity |
| `impacto.$id` | "Cargando…" | error + BackLink | `NotFound` | unchanged |
| `home-programs` | skeleton (miss) / cached (hit) | silent null | silent null | marketing graceful degradation |
| `index` HomeAllies | blank (miss) / cached (hit) | silent null | silent null | idem |

Policy: route pages distinguish error vs empty with page-specific copy; home
sections degrade silently. No shared component (copy differs per page). Only edit
was `impacto.index`'s added empty branch.

## Index / rules decision

**No `firestore.rules` and no `firestore.indexes.json` change** (decision B). The
`showcase` collection is already `allow read: if true`, which covers the filtered
`list` query. Therefore **no /security-review was required** and none was run
(confirmed: the branch touches only `apps/spotlight/**` + docs; the
security-review-gate fires on `firestore.rules`/beacon/auth only).

## Review gates

- **/simplify** (4 angles): applied — folded the two cached hooks into one `useCached` HOC, `useState` lazy-seed (dropped ref-box), dropped a no-op `useMemo`, simplified `dedupe`, `makeShowcaseCache` factory, hoisted the triplicated `mockStorage`.
- **/code-review high** (A/B/C correctness opus + altitude/conventions): **3-way finder consensus on one real bug** — `useCached` suppressed only `loading` on a cache hit, so a **failed background revalidation flipped `error:true` and every consumer's error branch hid the still-present cached content** (opposite of SWR; on /impacto the hero also kept showing cached counts while the body showed the error). Fixed: suppress `error` symmetrically on a hit (`error: state.error && miss`); miss still surfaces the error. Plus a `reviveShowcase` guard (malformed millis → throw → clean refetch). Both TDD'd. Skipped (noted): null-vs-miss sentinel future-proofing (all current consumers cache arrays, documented invariant — YAGNI) and wiring `dedupe` into showcase/allies (no current double-mount consumer — YAGNI).
- **bundle-budget-watcher**: index gz **flat, 90.67 → 90.65 kB** (within ≤100 budget). The eager firestore-lite vendor chunk grew **+2.72 kB gz (36.34 → 39.06)** from the new `query`/`where`/`Timestamp` runtime imports — a **conscious trade** (fixed +2.72 kB bundle to stop downloading an unbounded collection on every home visit), still eager on both branches (no tier shift), not CI-gated. Note: only ~0.94 kB under the judgment-only 40 kB per-chunk line — watch the next change that touches that chunk. Also noted: `docs/performance.md:24` claims firestore-lite is lazy/data-route-only, but it's modulepreloaded (eager) on both branches — pre-existing, fix the doc next time it's touched.

## Guardrails

`eslint` (react-hooks enforced — the HOC passes rules-of-hooks) 0 · `tsc` 0 ·
vitest **48 passed** · `knip` 0 · prettier clean · build 0. `pnpm pr-tests`: see PR.

## Files touched

`apps/spotlight/src/`: `lib/cached-resource.ts`(+test), `lib/use-cached-async.ts`(+test),
`showcase/showcase-firestore.ts`(+test), `showcase/use-showcase.ts`,
`allies/use-allies.ts`, `site-config/use-site-config.ts`(+test refactor),
`components/home-programs.tsx`, `routes/index.tsx`, `routes/impacto.index.tsx`,
`test/mock-storage.ts`. Untouched: `use-async.ts`/`use-async-on-visible.ts`
(item-11 #142), `firestore.rules`, `firestore.indexes.json`, query-client,
backstage, beacon.
