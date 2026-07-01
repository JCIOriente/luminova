# Real board dashboard (B3) + `/me` retention (B1) — design

_Date: 2026-07-01 · Roadmap: B3 (P0) + B1 retention · Ships as two PRs (B3 first)._

## Problem

The board dashboard at `/` (`components/overview/overview-view.tsx` + `overview-mock.ts`)
is the first screen every board member sees on every login, and almost all of it is
**fabricated**: only the active-member count and ally count are real. Both KPI trends,
every sparkline, the membership/attendance chart, the upcoming-events list, the activity
feed, and "Tareas pendientes" are mock. Fabricated-but-polished data erodes trust the day
someone acts on an invented number.

Separately, the member home `/me` is fully real but gives a member little reason to return
between events: the stored `birthdate` / `joinDate` are unused, and there is no
upcoming-events feed.

## Goals

- **B3:** every dashboard widget shows real data or an honest empty/loading state. No
  fabricated numbers. **No new Firestore read surface, no rules change** — reuse existing
  hooks only.
- **B1:** add an upcoming-events feed + a "Momentos" milestone strip (own milestones +
  community birthdays) to `/me`, reusing existing reads.

## Non-goals

- KPI trend arrows and sparklines that require historical snapshots we do not store — these
  are **dropped**, not faked. (A future snapshot job could reintroduce them honestly.)
- A real cross-activity check-in attendance feed (needs a new query + index + rules review) —
  deferred; the feed is derived from already-readable data instead.
- Notifications backend (K1). Any widget that truly depends on it stays honest-empty.

## Architecture

**Pattern: pure selectors + presentational components.** Both routes already have every hook
they need. Add small **pure functions** (unit-testable, no React/Firestore) that transform
already-fetched query data into typed view models. Components render the model. Delete
`overview-mock.ts`. Zero new repositories, zero new Firestore queries, zero rules changes.

Rejected alternatives: a `useDashboard` mega-hook (hides data deps, harder to test); inlining
derivations in the route/component (untestable, mixes concerns).

---

## PR #1 — B3 real dashboard

### Data flow

`_app.index.tsx` already fetches `useMembers()` + `useAllies()`. Add the already-existing,
already-cached hooks: `useActivitiesByTerm(termId)`, `useMemberPointsByTerm(termId)`,
`useInitiativesByTerm(termId)`, and `useTerm()` for the current term id (same trio the
leaderboard and `/me` already use). A single pure selector:

```
buildDashboardModel({ members, allies, activities, memberPoints, initiatives, now })
  → DashboardModel
```

produces a typed model. `OverviewView` changes signature from
`(memberCount, allyCount, userName, roles)` to `(model, userName, roles)` and no longer
imports `OVERVIEW_MOCK`. The route shows the existing skeleton while any source is loading.

### `DashboardModel` shape

```ts
type DashboardKpi = { label: string; value: number; delta: string | null };
// delta is a real, computed sentence (e.g. "+2 · este mes") or null when we cannot
// honestly compute one. NO sparkline field — sparklines are removed.

type DashboardModel = {
  kpis: {
    activeMembers: DashboardKpi;   // value real; delta = members joined this month (joinDate)
    upcomingEvents: DashboardKpi;  // value = filterActivities("proximos").length; delta null
    allies: DashboardKpi;          // value real; delta null
    pointsThisMonth: DashboardKpi; // value = Σ memberPoints.byMonth[thisMonthKey]; delta null
  };
  pointsByMonth: { monthKey: string; label: string; points: number }[]; // real chart series
  upcomingEvents: UpcomingEventItem[]; // real, from filterActivities("proximos"), soonest first
  feed: FeedItem[]; // derived, newest first, capped (~8)
};
```

### Widget-by-widget

| Widget (layout key) | New behavior |
|---|---|
| `kpis` → *Miembros activos* | real count (`m.active`); real delta "joined this month" from `joinDate`. Sparkline removed. |
| `kpis` → *Próximos eventos* | real count from `filterActivities("proximos")`. delta null. |
| `kpis` → *Aliados* | real count. delta null. |
| `kpis` → *Tareas pendientes* | **removed.** Replaced by ***Puntos otorgados (mes)*** — Σ `memberPoints.byMonth[thisMonthKey]`. |
| `chart` | "Puntos otorgados por mes" — **one real series** from summed `byMonth` across the term. Replaces the fake two-series membership/attendance chart. |
| `upcomingEvents` | real upcoming activities (title, Bolivia-local date, location, status badge). Honest empty state when none. |
| `recentActivity` | **derived feed** (see below). Honest empty state when none. |
| `headerActions`, `quickActions` | kept as real navigation shortcuts (already navigate; no data). |

Role layouts (`board-home-layout.ts`) are unchanged — same widget slots, real data. Treasury /
ExecutiveCommittee layouts already omit `upcomingEvents`/`quickActions`; nothing references a
money widget, so no honest-empty money card is needed here (money lands with J5).

### Derived activity feed

Pure `deriveActivityFeed({ members, activities, initiatives, now, limit })`. Merges domain
events we can already read and timestamp, sorts newest-first, caps at `limit`:

- **New member** — `member.joinDate` → "Nuevo miembro: {name}".
- **Executed activity** — `activity.status === "Ejecutada"`, timestamped by `startAt` →
  "Actividad realizada: {title}".
- **Completed initiative** — completed programs/projects, timestamped by their completion/end
  date → "Iniciativa completada: {title}".

Each `FeedItem = { id; tone; text; strong; at: Date }`. Exact initiative completion field is
confirmed against the initiative type during TDD; if an initiative lacks a usable completion
timestamp, that source is omitted rather than faked. Bolivia-offset handling mirrors
`filterActivities`.

### Removing the mock

`overview-mock.ts` is deleted. `overview-view.tsx` drops the import and renders `model`. Any
sub-component prop types that referenced mock shapes move to the `DashboardModel` types (new
file `components/overview/dashboard-model.ts`, holding the types + the pure selectors, or a
sibling `dashboard-model.ts` + `dashboard-model.test.ts`).

---

## PR #2 — B1 `/me` retention

Two sections added below the existing credential/QR grid on `_app.me.tsx` (already 100% real):

### Próximos eventos

Reuses `useActivitiesByTerm` + `filterActivities(activities, "proximos", now)` — no new
backend. Renders the soonest N (~5) upcoming activities (title, date, location). Honest empty
state ("No hay eventos próximos") when none.

### Momentos (milestones)

Pure selectors over the member and the member list:

- `memberMilestones(member, now)` → own signals:
  - **Birthday countdown** — days until the next `birthdate` month/day → "Tu cumpleaños en X
    días" (or "¡Hoy es tu cumpleaños!" at 0).
  - **Membership anniversary** — completed years since `joinDate` → "X años como miembro"
    (and a countdown to the next anniversary if within ~30 days).
- `upcomingBirthdays(members, now, limit)` → community strip: the next ~5 members by upcoming
  birthday, **name + day/month only (no year)**, excluding the current member. Inactive
  members excluded.

`/me` adds `useMembers()` (already signed-in-readable — the same scope the leaderboard uses),
so **no `firestore.rules` change**. Dropping the birth *year* minimizes exposure.

---

## Error / empty / loading states

- Route shows the existing skeleton grid while any source query is loading.
- Every list/chart widget has an explicit empty state; no widget renders fabricated filler.
- Selectors are total functions: empty inputs → empty model, never throw.

## Testing (TDD)

All logic lives in pure selectors, unit-tested first (RED → GREEN):

- `buildDashboardModel` — counts, deltas, month keys, thisMonth points sum, ordering.
- `deriveActivityFeed` — merge/sort/cap, per-source mapping, Bolivia offset, missing-timestamp
  source omitted.
- `upcomingEventsForMember` (thin wrapper over `filterActivities`) — ordering + limit.
- `memberMilestones` — birthday countdown across year boundary, day-of birthday, anniversary
  year count.
- `upcomingBirthdays` — ordering across year boundary, excludes self + inactive, no year leaked.

Component tests assert real values render and empty states appear on empty input. Existing
`_app.me.test.tsx` / `_app.index` behavior preserved.

## Security

- **No auth / rules / beacon / repository changes.** No `/security-review` gate triggers.
- B1 reads only already-readable member data (same scope as the leaderboard) and renders
  birthdays without the year. Noted in the PR body for reviewer awareness; no rules edit.

## Rollout

- PR #1 (B3) first — the P0 trust fix. PR #2 (B1) second.
- Each: worktree off `main`, TDD, `/simplify` + `bundle-budget-watcher` before done, then
  `gh pr create` + `pnpm pr-tests`. Both are frontend-only (no new deps expected).
