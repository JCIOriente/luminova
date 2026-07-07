# Spotlight data-layer consistency (audit item 12)

Date: 2026-07-07
Branch: `feat/spotlight-data-layer`
Audit source: `docs/status/2026-07-02-full-audit.md` row 53 (item 12); detail rows 109 (`showcase-firestore.ts:21`), 110 (`use-showcase.ts:5`), 113 (`home-programs.tsx:51`).

## Problem

Public spotlight reads are inconsistent and one is wasteful:

1. `fetchFeatured` downloads the **entire** `showcase` collection and filters `featured` in JS — bytes-over-wire waste on a public, perf-budgeted home page.
2. Only `siteConfig` has SWR-over-localStorage caching. `showcase` and `allyShowcase` re-fetch cold every visit (skeleton flash, redundant reads).
3. Two sites (`home-programs.tsx`, `index.tsx` HomeAllies) **bypass** the `use-showcase` hook layer and hand-wire `useAsyncOnVisible(fetchX, …)` directly.
4. Empty-vs-error rendering diverges across the five consumers (some show distinct copy, some collapse error+empty to silent-null, one lacks an empty branch).

## Decisions (confirmed with user)

- **A — SWR policy: match site-config (no TTL).** Cache paints instantly for first paint; the network **always** revalidates once per load (deduped across concurrent mounts); the fresh value replaces state. The cache is a first-paint accelerator, never a "too stale to use" gate. President content edits appear on the next load.
- **B — Featured query: server-side `where` + client sort.** `query(collection(db,"showcase"), where("featured","==",true))`. Firestore auto-indexes single-field equality → **no composite index**, no `firestore.indexes.json` change, no deploy, no rules change (the collection is already `allow read: if true`, which covers filtered `list`), no security-review gate, no emulator CI job. `completedAt` sort stays client-side. Downloads only featured docs regardless of collection size.
- **C — Home-section SWR paint: paint cached instantly, defer network.** On mount, if cache exists, the two below-fold home sections paint cached content immediately (already-downloaded bytes, zero network); the revalidation network read still waits until the section scrolls into view (preserves the no-network-until-visible perf rule).

## Constraint: item-11 hooks are open in PR #142

`lib/use-async.ts` and `lib/use-async-on-visible.ts` are modified by the still-open PR #142 (item 11, enforced `exhaustive-deps`). All five of their consumers are exactly this item's surface, so replacing them would orphan both files (knip red) and deleting/editing them would conflict with #142.

**Resolution:** the new cached hooks **compose** the item-11 hooks rather than replace them — no edits, no orphan, no conflict. Dev-visible error logging lands at the **data-layer boundary** (the wrapped fetcher), not the generic runner, which also fits the "data-layer consistency" framing better.

## Architecture

### New: `lib/cached-resource.ts`

```
makeResourceCache<T>({ key, serialize?, revive? }): { read(): T | null; write(v: T): void }
dedupe<T>(fn: () => Promise<T>): () => Promise<T>   // one shared inflight promise
```

- `read`: `localStorage.getItem(key)` → `JSON.parse` → `revive?.(raw) ?? raw`; any throw → `null`.
- `write`: `JSON.stringify(serialize?.(v) ?? v)` → `setItem`; any throw (quota/private mode) → swallowed.
- `serialize`/`revive` make Timestamp caching deterministic (see below).

### New: `lib/use-cached-async.ts`

```
useCachedAsync<T>(cache, fetcher, fallback): Async<T>
useCachedAsyncOnVisible<T>(cache, fetcher, fallback): AsyncOnVisible<T>
```

Each:
1. Reads `cache.read()` once at mount into a ref (`cached`).
2. Wraps the fetcher: `() => fetcher().then(v => (cache.write(v), v)).catch(e => { if (import.meta.env.DEV) console.error("[spotlight] <key> read failed", e); throw e })`.
3. Delegates the lifecycle to `useAsync` / `useAsyncOnVisible` with `cached ?? fallback` as the empty value.
4. Returns the inner state but with `loading: inner.loading && cached === null` — a cache hit paints instantly (no skeleton), a cache miss shows the skeleton as before.

`import.meta.env.DEV` guards the log so it never ships to the prod console.

### Timestamp serialization

`ShowcaseItem` carries three top-level `Timestamp` fields (`startDate`, `endDate`, `completedAt`); nested `photos`/`team`/`impact` are Timestamp-free. Firestore `Timestamp` JSON round-trip is version-fragile, so the showcase caches store **millis** and revive via `Timestamp.fromMillis`:

- `serialize(items)` → each item's three Timestamps → `.toMillis()` numbers.
- `revive(raw)` → those numbers → `Timestamp.fromMillis(n)`.

`AllyShowcaseItem` has no Timestamps → identity cache (no serialize/revive). `siteConfig`'s `Resolved` omits `updatedAt` → already JSON-safe; its `revive` is the existing `withDefaults` backfill.

### Wiring

| File | Change |
|------|--------|
| `site-config/use-site-config.ts` | Refactor onto `makeResourceCache` (revive = `withDefaults`) + `dedupe`. Behavior-identical. |
| `showcase/showcase-firestore.ts` | `fetchFeatured` → `query(where("featured","==",true))` + client sort. Define `showcaseListCache`, `featuredCache` (millis serialize / Timestamp revive). |
| `showcase/use-showcase.ts` | `useShowcaseList`/`useFeaturedList` gain SWR via `useCachedAsync`. Add `useFeaturedListOnVisible()`. `useShowcaseItem` (per-id) stays plain `useAsync`, no cache. |
| `allies/use-allies.ts` (new) | `useAlliesOnVisible()` over `alliesCache` (identity). |
| `components/home-programs.tsx` | Swap `useAsyncOnVisible(fetchFeatured…)` → `useFeaturedListOnVisible()`. Render logic byte-identical. |
| `routes/index.tsx` (HomeAllies) | Swap `useAsyncOnVisible(fetchAllies…)` → `useAlliesOnVisible()`. Render byte-identical. |

Cache keys: `jci.showcase.v1`, `jci.showcase.featured.v1`, `jci.allyShowcase.v1` (site-config keeps `jci.siteConfig.v1`). List and featured are distinct keys — featured is now the server-filtered subset, no collision.

## Empty-vs-error unification

| Site | loading | error | empty | data |
|------|---------|-------|-------|------|
| `programas.index` | skeleton | distinct error copy | distinct empty copy | grid |
| `impacto.index` | skeleton | distinct error copy | **add** distinct empty copy (parity) | grid |
| `impacto.$id` | "Cargando…" | error copy + BackLink | `NotFound` | detail |
| `home-programs` | skeleton (miss) / cached (hit) | silent null | silent null | grid |
| `index` HomeAllies | blank (miss) / cached (hit) | silent null | silent null | strip |

Policy: **route pages** distinguish error vs empty with page-specific copy; **home sections** degrade silently (marketing page). No shared component — copy differs per page. The only rendering edit is adding `impacto.index`'s missing empty branch for route-page parity.

## Non-goals

- No wholesale rewrite of the spotlight hooks.
- No touch to `use-async.ts`/`use-async-on-visible.ts` (PR #142), `firestore.rules`, `firestore.indexes.json`, `query-client`, backstage, beacon.
- No composite index (decision B).
- No TTL / stale-skip (decision A).
- Spotlight stays on `@luminova/firebase/lite` (no full-SDK barrel).

## Testing (TDD)

- `lib/cached-resource.test.ts` (new): read/write round-trip; revive + serialize applied; corrupt JSON → null; write throw swallowed; `dedupe` shares one inflight.
- `lib/use-cached-async.test.ts` (new): `loading:false` on cache hit, `loading:true` on miss; cache written on success; DEV-log on error (and suppressed when `DEV` false); on-visible defers network but paints cache on mount.
- `showcase/showcase-firestore.test.ts` (extend): `fetchFeatured` issues the `where` query and returns only featured, `completedAt`-desc; Timestamp millis round-trip preserves `.toMillis()`.
- `allies/ally-showcase-firestore.test.ts`: behavior unchanged (name sort); cache round-trip.
- `site-config/use-site-config.test.ts`: stays green after refactor.

## Guardrails

`pnpm --filter spotlight run ci` (prettier → eslint incl. enforced react-hooks → tsc → build → vitest → knip → size-limit) + `pnpm pr-tests`. `bundle-budget-watcher` after the change (expect no index-chunk regression; the `fetchFeatured` win is data-bytes, not bundle). No security-review required (no `firestore.rules` touch).
