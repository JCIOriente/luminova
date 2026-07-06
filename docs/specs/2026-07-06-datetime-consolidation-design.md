# Datetime consolidation — design (audit backlog item 9)

**Date:** 2026-07-06
**Branch:** `feat/datetime-consolidation`
**Audit refs:** `docs/status/2026-07-02-full-audit.md` line 51 (backlog row 9), detail row 83.

## Problem

Two parallel es-BO datetime formatting modules exist:

- `apps/backstage/src/lib/datetime.ts` (canonical) — every display formatter pins
  `timeZone: "UTC"` on purpose. Activity instants are input wall-clock pinned to UTC
  (`activity-mapper.ts`), so formatters render exactly what was scheduled, independent
  of the viewer's timezone. This is the **"UTC = what was scheduled"** policy.
- `apps/spotlight/src/components/showcase/format.ts` — reimplements month/date
  formatting with the **UTC pin missing** (format.ts:9/:10/:14) and range logic on
  **local-time getters** (`getFullYear`/`getMonth`). Same `es-BO` locale, so this is
  purely a timezone-pin gap, not a locale gap.

**Correctness impact (not just dedup):** for a viewer west of UTC (Bolivia is UTC-4),
a scheduled date near a month/year boundary renders the **wrong calendar month/year**.
This is a real off-by-a-day/month bug for non-UTC viewers.

A third instance of the same class: `_app.me.tsx:71` ("Mi panel") reads member
`joinDate` with `getFullYear()` (viewer-local) while every other joinDate reader routes
through the shared `joinYear()` helper's `getUTCFullYear()` → off-by-one **year** west
of UTC. The audit flagged this "panel" site as the fix-risk case to verify.

## Goal

One parameterized, zero-runtime-dependency, `Intl`-only es-BO datetime module consumed
by **both** apps, with the UTC pin applied. Fix the two spotlight sites and the panel
site. Do not change the UTC-scheduled policy — apply it, don't redesign it.

## Non-goals (explicit scope fence)

- **Number-locale** sites (`initiative-completed.tsx:6` `NUMBER_ES_BO`,
  spotlight `formatES`) — audit line 90, a **separate Low item**. `formatES` stays in
  spotlight. Not touched beyond leaving it where it is.
- **True-instant** sites are left as-is:
  - `present-table.tsx:33` `formatTime(checkInAt)` — a true check-in instant currently
    rendered with the UTC-pinned `formatTime`. Changing it (UTC→Bolivia) is a
    behavior change **out of item 9 scope**. Noted in handoff, not touched.
  - `site-config-form.tsx:53` `stampFormatter(updatedAt)` — true instant, correctly
    viewer-local. Left as-is.
  - `relativeTimeEs` (`overview-view.tsx:218`) — already correct (source converts
    pinned wall-clock → real instant via `BOLIVIA_OFFSET_MS`).
- Item 10 (QueryClient defaults), refuted findings — out of scope.

## Design

### 1. New package `@luminova/utils` (`packages/utils`)

Source-consumed (mirrors `@luminova/ui` / `@luminova/firebase`):

- `package.json`: `"main": "./src/index.ts"`, `exports` `"."` → `./src/index.ts` and
  `"./datetime"` → `./src/datetime.ts`; `"build": "tsc --noEmit"`; `"sideEffects": false`;
  type-only dep `"@luminova/types": "workspace:*"`.
- No dist artifact → no turbo `^build` ordering coupling; Vite bundles + tree-shakes
  from source through the pnpm workspace symlink. No tsconfig `paths` / vite alias
  needed (repo resolves `@luminova/*` purely via `exports`).
- **Bonus:** CLAUDE.md already documents `@luminova/utils` as an existing package
  (a Low audit finding: `CLAUDE.md:24`). Creating it closes that drift.

The module is the current `datetime.ts` content moved verbatim, plus:

- **`formatMonthYear(ts, opts?: { month?: "short" | "long" })`** — default `"short"`
  preserves all 6 backstage call sites byte-identically; spotlight passes
  `{ month: "long" }` ("Junio 2026"). One shared `MONTH_YEAR` short + one `MONTH_YEAR_LONG`
  formatter, both UTC-pinned, selected by the option.
- **`formatDateRange(start, end)`** — spotlight-only range formatter, moved in and
  **fixed**: UTC-pinned formatters + **UTC getters** (`getUTCFullYear`/`getUTCMonth`)
  for the same-year/same-month collapse (was local getters). Same-year collapse and
  `–` separator output shape preserved.

All 9 existing exports keep identical signatures and UTC-pinned behavior:
`BOLIVIA_OFFSET_MS`, `formatDateChip`, `formatDateTime`, `formatDate`, `formatTime`,
`formatMonthYear` (now with optional width), `boliviaDayKey`, `monthKeyToLabel`,
`relativeTimeEs`.

### 2. Backstage migration

Full-migrate all 12 `lib/datetime` importers to `@luminova/utils/datetime`; **delete**
`apps/backstage/src/lib/datetime.ts`. Mechanical path swap, no behavior change (default
`month:"short"` keeps `formatMonthYear` output identical). Split into ≤10-file commits.

Move `datetime.test.ts` alongside the module in `packages/utils` (backstage's vitest
setup no longer owns it).

### 3. Spotlight migration

- `showcase-card.tsx:18` — `formatMonthYear(completedAt, { month: "long" })` from
  `@luminova/utils/datetime` (was local, unpinned). Now UTC-pinned → correct month.
- `impacto.$id.tsx:35` — `formatDateRange(startDate, endDate)` from
  `@luminova/utils/datetime` (was local, unpinned + local getters). Now UTC-correct.
- `format.ts` slims to just `formatES` + its `numberFormatter` (number-locale, kept).
  Remove the now-unused date formatters + `stripDot` from it (they move into the module).
  Add `@luminova/utils` to `apps/spotlight/package.json`.

### 4. Panel fix

`_app.me.tsx:71` — replace `member.joinDate.toDate().getFullYear()` with the existing
shared `joinYear(member.joinDate)` helper (`member-display.ts`, `getUTCFullYear`).
Off-by-one fixed; consistent with member-table/drawer/csv/credential-card.

## Testing

`packages/utils/src/datetime.test.ts` mirrors the existing suite and **adds** the
core-bug proof (RED-first): a non-UTC scheduled date near a boundary renders the
correct UTC calendar month/year — specifically `formatMonthYear` and `formatDateRange`
on a `T00:00:00Z`-pinned date must NOT roll back to the prior month/year (which
local-time getters would do west of UTC). Assert `month:"long"` shape too.

Panel: a small test that `joinYear` on a `YYYY-01-01T00:00:00Z` joinDate returns the
stored year (not year-1) — the existing member-display test likely already covers the
helper; the fix just routes the panel through it.

## Guardrails

- Zero-dep, `Intl`-only — **no** date-fns/luxon/dayjs (spotlight is perf-critical).
- `knip` — zero NEW unused exports (spotlight's now-unused local date formatters are
  deleted, not left dangling).
- `bundle-budget-watcher` after — module must add no measurable spotlight index weight
  (tree-shaken source, `sideEffects:false`).
- `/simplify` → `/code-review high` → `/security-review` (low surface: date formatting,
  no injection/user-controlled format string) → `pnpm pr-tests`.

## Files touched (estimate)

- New: `packages/utils/{package.json,tsconfig.json,src/index.ts,src/datetime.ts,src/datetime.test.ts}`
- Backstage: 12 importer path swaps + delete `lib/datetime.ts` + `_app.me.tsx` panel fix
- Spotlight: `format.ts` slim, `showcase-card.tsx`, `impacto.$id.tsx`, `package.json`
- `CLAUDE.md` note (optional): `@luminova/utils` now real.
