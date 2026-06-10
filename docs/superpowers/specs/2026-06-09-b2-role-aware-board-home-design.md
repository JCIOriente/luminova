# B2 — Role-aware board home (design)

**Date:** 2026-06-09
**Track:** B2 (roadmap.md → "B. Member-facing surface & role-aware home")
**Status:** approved, ready for plan
**Dep:** F1 (roles + abilities — shipped)
**Parallel-safe with:** H1 (zero file overlap)

## Problem

The admin board home (`/` → `_app.index.tsx` → `overview-view.tsx`) is identical for
every privileged role. A Treasury officer, a Membership officer, and a Project
Manager all land on the same hardcoded widget order. #20 only added the member-only
→ `/me` redirect; the board home itself is still one-size-fits-all.

## Goal

Make the board home **lead with what each role needs**, by reordering and
show/hiding the existing widgets per role. **Presentation layer only** — no new
data, no new queries, no widget gains real data here. The Overview stays mocked
underneath exactly as today; B2 only changes *which* widgets show and *in what
order*.

Non-goals (explicit): replacing mocked data with real data, building new
role-specific widgets, touching `/me`, any Firestore/rules/functions change.

## Approach

A pure helper drives a data-driven layout instead of the current hardcoded JSX
order.

```
boardHomeLayout(roles: Role[]): WidgetKey[]
```

- Input: the user's role claims (`claims.roles`, already available via the auth
  context used by `_app.index.tsx` and `useAbility()`).
- Output: an ordered, filtered list of widget keys.
- `OverviewView` maps over that list and renders each widget, instead of the
  current fixed sequence.

### Widget keys (existing widgets only)

Derived from `overview-view.tsx` today: `kpis`, `chart`, `upcomingEvents`,
`recentActivity`, `quickActions`, plus the header create-buttons
(`headerActions`).

### Role → layout mapping

Highest-privilege role wins ordering; multi-role = union of visible widgets,
ordered by the top role. Admin always sees the full default. Unknown / no-match
falls back to the current default order.

| Role | Lead order | Hidden |
|------|-----------|--------|
| **Admin** | default: `kpis, chart, upcomingEvents, recentActivity, quickActions` + `headerActions` | — |
| **Membership** | `kpis` (members-first), `quickActions`, `recentActivity`, `chart`, `upcomingEvents` | — |
| **Treasury** | `kpis` (money-first, **stub-labeled** — J not built), `recentActivity`, `chart` | `quickActions` (member create), member `headerActions` |
| **ProjectManager** | `upcomingEvents`, `quickActions` (projects/activities), `kpis`, `recentActivity` | member admin `headerActions` |
| **ExecutiveCommittee** | `kpis`, `recentActivity`, `chart` (read-only) | `quickActions`, all `headerActions` (create buttons) |

Stub-labeling note: Treasury "money-first" reuses the existing mocked KPI card;
where a genuinely money widget doesn't exist yet, the slot stays a clearly-labeled
placeholder. No new data plumbing in B2.

### Privilege ordering

Reuse the privilege notion already in `is-member-only.ts`
(`PRIVILEGED = [Admin, Membership, Treasury, ExecutiveCommittee, ProjectManager]`).
Define an explicit precedence array for tie-breaking multi-role users:
`[Admin, ExecutiveCommittee, Treasury, ProjectManager, Membership]` (precedence is
about *which role's layout to show*, not authority). The chosen role's mapping
drives order; visible-widget set is the union across the user's roles.

## Components / files touched (apps/backstage only)

- `src/components/overview/board-home-layout.ts` — **new** pure helper +
  `WidgetKey` type + role→layout table. No React, no I/O.
- `src/components/overview/overview-view.tsx` — render widgets from the helper's
  ordered list instead of fixed JSX; gate `headerActions` / `quickActions` by
  membership in the returned set.
- `src/components/overview/board-home-layout.test.ts` — **new** unit tests.

No changes to nav-config, abilities, routes, types, firebase, or rules.

## Error handling / edge cases

- Empty roles array → default layout (defensive; route guard already redirects
  member-only users away).
- Role string not in the table → ignored for ordering; default precedence applies.
- A widget key in the layout list with no matching renderer → skipped (no crash).

## Testing

Unit (Vitest) on `boardHomeLayout`:
- Each single role → exact expected ordered key list.
- Admin → full default.
- ExecutiveCommittee → no `quickActions`/`headerActions` in output.
- Treasury → no member `quickActions`.
- Multi-role (e.g. `[Membership, Treasury]`) → top-precedence layout, union of
  visible widgets.
- Empty / unknown role → default.

No data/integration tests — presentation only.

## Out of scope / follow-ups

- Real data for any widget (events feed → D2, money → J-track).
- New role-specific widgets.
- `/me` changes.

## Skill/review checklist

- `react-best-practices` (auto on `.tsx` edit).
- No `/security-review` needed (no auth/rules/functions/data-boundary change).
- `superpowers:test-driven-development` — helper test first.
- `bundle-budget-watcher` optional (no new dep, negligible size).
