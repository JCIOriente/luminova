# Datetime consolidation handoff (audit item 9, PR #139 OPEN)

**Date:** 2026-07-06 · **Branch:** `feat/datetime-consolidation` · **PR:** #139
**Spec:** `docs/specs/2026-07-06-datetime-consolidation-design.md`

## What shipped

One zero-runtime-dep, Intl-only `@luminova/utils` package (`@luminova/utils/datetime`)
folds the two parallel es-BO datetime modules. Backstage `lib/datetime.ts` moved
verbatim (UTC-pinned); spotlight's local formatters deleted and repointed. Fixes the
off-by-a-month/day bug for viewers outside UTC + the `/me` panel off-by-one year.

## Import-boundary decision

Spotlight cannot import backstage internals (no cross-app imports; sharing is via
`@luminova/*` workspace packages). Chose **new source-consumed `@luminova/utils`**
(`main`/`exports` → `src`, `build: tsc --noEmit`, type-only `@luminova/types` dep,
`sideEffects:false`) over a `@luminova/types` subpath (dist/build-required + layering
smell) or duplicate-then-pin (rejected). No tsconfig/vite wiring needed — repo resolves
`@luminova/*` purely via `exports`. Creating the package also closed the standing
CLAUDE.md drift (it documented `@luminova/utils` as existing; it did not).

## Per-site intent table

| Site | Formats | Intent | Action | Reason |
|------|---------|--------|--------|--------|
| `spotlight showcase-card.tsx:18` | completedAt month | scheduled wall-clock | **UTC-pin** (`formatMonthYear {month:"long"}`) | was viewer-local → wrong month off-UTC |
| `spotlight impacto.$id.tsx:35` | startDate–endDate range | scheduled wall-clock | **UTC-pin** (`formatDateRange`, UTC getters) | was local getters → wrong collapse/month off-UTC |
| `backstage _app.me.tsx:71` (panel) | member joinDate year | stored calendar date | **UTC-fix** (route through `joinYear()`) | local `getFullYear()` → prior-year west of UTC; **the flagged fix-risk site** |
| `backstage` 12 `lib/datetime` importers | various | — | **repoint only** | mechanical path swap; default `formatMonthYear` width stays `short` → byte-identical |
| `backstage present-table.tsx:33` | checkInAt time | **true instant** | **left as-is** | UTC-pinned formatter on a real instant → pre-existing 4h skew concern; behavior change, out of item-9 scope. **Noted for a future item.** |
| `backstage site-config-form.tsx:53` | updatedAt stamp | **true instant** | **left as-is** | correctly viewer-local for an instant |
| `backstage overview-view.tsx:218` | relative time | **true instant** | **left as-is** | already correct (source applies `BOLIVIA_OFFSET_MS`) |
| `spotlight format.ts formatES` | number | **number-locale** | **left as-is** | audit line 90, separate Low item |
| `backstage initiative-completed.tsx:6` | numbers | **number-locale** | **left as-is** | audit line 90, separate Low item |

## The non-UTC-viewer test (proves the bug fixed)

`packages/utils/src/datetime.test.ts` runs under `TZ=America/La_Paz` (UTC-4) set via
`vitest.config.ts` `test.env` — **at the config layer, not in-file**. Code-review caught
that an in-file `process.env.TZ` assignment runs *after* ESM-hoisted imports, so
module-scope formatters would be constructed under the host TZ (false-green on a UTC CI
runner if a future formatter forgets the pin). The config sets it before modules load;
verified empirically that a module-scope unpinned formatter resolves to La Paz under a
forced `TZ=UTC` host. Boundary cases (`2026-01-01T00:00Z`): `formatMonthYear` must stay
`Enero de 2026` (not `Diciembre de 2025`) and `formatDateRange` must stay collapsed
(not de-collapse to a 2025 label). Proven RED-first, then GREEN. 17/17.

## GOTCHAs / invariants preserved

- **es vs es-BO was a non-issue** — spotlight already used `es-BO`; the audit's "es vs
  es-BO" phrasing didn't apply. The real delta was the missing UTC pin + local getters.
- **es-BO long month = "Junio de 2026"** (with "de"). Preserved verbatim; don't "fix" the "de".
- **`formatDateRange` output is lowercase, en-dash** (`"may – jun 2026"`) — pre-existing, preserved.
- **`formatMonthYear` width via optional param** (user-chosen over two functions; matches
  the audit's "parameterized module" language). `MONTH_YEAR_LONG` is referenced
  unconditionally by `formatMonthYear`, so any app calling it bundles it — `@__PURE__`
  only prunes formatters behind *uncalled* functions (spotlight sheds DATE_TIME/DATE_ONLY/
  TIME_ONLY; it does NOT shed MONTH_YEAR_LONG).
- **`joinYear()` stayed in `member-display.ts`** (member-domain glue, not a generic
  formatter) — correct boundary, not moved into the shared module.
- **Did NOT touch** item-7 InitiativeRepository, item-8 usePhotoCrud/storage-object,
  firestore.rules, repositories, beacon, auth.

## Gates

`/simplify` (clean; the one options-vs-two-functions finding skipped — user-decided),
`/code-review high` (2 valid findings hardened: TZ-at-config + @__PURE__ comment; cross-file
+ removed-behavior clean), `/security-review` (no findings — no injection/auth/crypto
surface; gate hook correctly didn't fire). bundle-budget-watcher: spotlight 0 B delta,
backstage +0.4 kB gz, both within budget. `pnpm pr-tests` green (turbo ci, knip, audit no
vulns, seed 20/20).

## Next

Audit backlog **item 10 — QueryClient defaults** (`(S, behavior change)`): brainstorm the
staleTime/retry/refetchOnWindowFocus policy with the user first, then audit per-hook
overrides the new defaults make redundant.
