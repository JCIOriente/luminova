# Backstage UI Uplift — Design Spec

**Date:** 2026-06-05
**Branch:** `feat/backstage-ui-uplift`
**Source design:** Claude Design handoff "Backstage" (JCI Oriente admin dashboard) — `Backstage.html` + `dashboard.css` + `colors_and_type.css`, recreated pixel-faithfully on the existing `@luminova/ui` token system.

## Goal

Lift `apps/backstage` from its bare scaffold (plain flex sidebar, `p-8` main, placeholder dashboard, unstyled tables) to the design-system admin dashboard: a proper app shell (sidebar + topbar), a composed Overview page, and restyled Members/Allies pages — all built on the locked JCI Oriente tokens already in `@luminova/ui`.

## Scope (decided)

In scope:

- **App shell** — grouped collapsible-ready sidebar (static expanded) + sticky blurred topbar.
- **Overview page** — 4 KPI cards (2 real, 2 mock), dual-series SVG chart, upcoming-events list, activity timeline, quick actions.
- **Members + Allies** — restyled tables (Badge status, ghost row-actions, toolbar, page headers).
- **Reusable primitives** added to `@luminova/ui`.

Explicitly deferred (out of scope this pass):

- **Dark mode** — token structure left dark-ready (no hardcoded hex in components), but `[data-theme="dark"]` set + toggle + persistence not added now.
- **⌘K command palette** — topbar ships a non-functional search affordance only.
- **Mock-only sections** — Eventos, Proyectos, Comunicaciones, Reportes, Configuración pages. Built when their backends land. Sidebar shows only real routes (Inicio, Miembros, Aliados), grouped.

## Architecture

### Component placement — hybrid

Genuinely-reusable, app-agnostic primitives → `@luminova/ui` (pure Tailwind utilities, token-driven, exported from `src/index.ts`, consumed + smoke-tested so knip is satisfied). The admin shell (backstage-only layout) stays app-local.

**New `@luminova/ui` components:**

| Component | File | Notes |
|-----------|------|-------|
| `Badge` | `components/badge.tsx` | Pill; tones `blue\|teal\|green\|amber\|red\|gray\|navy`; optional leading dot. Replaces ad-hoc `StatusBadge` in member/ally tables. |
| `KpiCard` | `components/kpi-card.tsx` | Icon tile + label + big tabular value + semantic trend (▲/▼) + sparkline slot. Tone variants map icon-tile color. |
| `Sparkline` | `components/sparkline.tsx` | Dependency-free tiny SVG line from a number[]. |
| `LineChart` | `components/line-chart.tsx` | Dependency-free dual-series SVG area/line; range prop; hover tooltip. |
| `Skeleton` | `components/skeleton.tsx` | Shimmer block; `motion-reduce` disables animation. |
| `EmptyState` | `components/empty-state.tsx` | Art slot + title + copy + CTA slot. |

**Icons** — extend existing `components/icons.tsx` with admin glyphs (24×24, 1.6 stroke, round caps/joins, `currentColor`): `home, calendar, folder, handshake, megaphone, barChart, settings, bell, search, sidebarLeft, chevRight, chevExpand, trendUp, trendDown, plus, download`.

**Backstage app-local (`apps/backstage/src/`):**

| Unit | File | Responsibility |
|------|------|----------------|
| Sidebar | `components/app-sidebar.tsx` (rewrite) | Logo lockup, grouped nav (`Panel`/`Gestión` labels), active state (blue text + left rail), per-item counts, user footer w/ logout. |
| Topbar | `components/app-topbar.tsx` (new) | Breadcrumb `Backstage › <section>`, search affordance (inert, ⌘K deferred), notifications + avatar buttons, avatar menu (logout). |
| Shell | `routes/_app.tsx` (rewrite) | Grid `[sidebar | (topbar + scrollable content)]`; canvas background. |
| Overview | `routes/_app.index.tsx` (rewrite) + `components/overview/*` | Compose KPI row, chart panel, upcoming events, activity, quick actions. |
| Mock data | `components/overview/overview-mock.ts` (new) | Clearly-named seeded mock for non-backed widgets. |
| Layout CSS | `styles.css` (extend) or `dashboard.css` (new, app-local) | Layout-only structural bits not clean in Tailwind: sticky blurred topbar, custom scrollbar, sidebar grid transition, `.rise` entrance. No color values — tokens only. |

### Tokens

- All colors/radii from existing `@luminova/ui/theme.css` (`--color-jci-*`, `--color-ink-*`, `--color-surface*`, `--color-line*`, `rounded-pill`, `rounded-card`).
- Add only missing `--color-*` if a design surface has no token (audit during impl; prefer reusing existing).
- **No hardcoded hex in components** — keeps the deferred dark mode a pure token-override later.
- Page canvas = `surface-2` (`#F7F9FB`); cards/panels = `surface` (`#FFFFFF`); hairlines = `line` / `line-strong`.

### Data flow (Overview)

- `useMembers()` → "Miembros activos" KPI count (real).
- `useAllies()` → "Aliados" KPI count (real).
- `overview-mock.ts` → Eventos + Tareas KPIs, dual-series chart data, upcoming-events list, activity timeline, quick actions, and trend/sparkline series for the real KPIs (no historical data exists yet; mock module documents this honestly).
- States: loading → `Skeleton` cards; no members → `EmptyState`.

### Tables

Reuse existing `@luminova/ui` `Table*` primitives. Changes:

- Status column → `Badge`.
- Action column → ghost/icon row-actions (replace pair of secondary buttons).
- Tabular-nums for numeric/date columns; light hover (no heavy zebra).
- Toolbar above table: search field + filter chips (wire existing search if present; otherwise visual-only this pass).
- Page header: eyebrow (mono, uppercase) + title + sub + primary action — matches design.

## Testing & gates

- Vitest render test per new `@luminova/ui` primitive (also satisfies knip "consumed export").
- Update existing member/ally table tests for `Badge` + row-action markup.
- `pnpm --filter backstage run ci` (prettier → eslint → tsc → build → vitest → knip → size-limit) + `pnpm --filter @luminova/ui` equivalents.
- Dispatch `bundle-budget-watcher` after impl — new components + inline SVG chart could move size-limit.
- **No security-review trigger** — no auth, repository, or `firestore.rules` changes.

## Non-goals / YAGNI

- No sidebar collapse interaction (structure ready, behavior later with ⌘K/dark-mode pass).
- No charting library — hand-built SVG only.
- No new Firestore reads beyond existing `useMembers`/`useAllies`.
- No fake CRUD pages.

## Risks

- **Bundle size** — inline SVG chart + new components vs size-limit budget. Mitigation: dependency-free, watcher dispatch.
- **knip unused-export** — every new `@luminova/ui` export must be consumed by an app or smoke test.
- **Mock/real seam** — Overview mixes real counts and mock widgets; mock module must be unambiguous so it's not mistaken for real data later.
