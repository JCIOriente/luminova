# B2 Role-aware Board Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the backstage board home (`/`) lead with the widgets each privileged role needs, by reordering/hiding the existing (still-mocked) widgets per role.

**Architecture:** A pure helper `boardHomeLayout(roles)` returns an ordered, filtered list of widget keys. `OverviewView` renders widgets from that list instead of a hardcoded JSX sequence. Presentation-only: no new data, queries, routes, rules, or types.

**Tech Stack:** React 19, TypeScript strict, TanStack Router, Vitest, `@luminova/auth` (CASL roles), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-09-b2-role-aware-board-home-design.md`

**Branch:** `feat/b2-role-aware-board-home` (off `main`). Parallel-safe with H1 — no shared files.

---

## Pre-flight

- [ ] **Step 0: Branch + read context**

```bash
git checkout main && git pull --ff-only
git checkout -b feat/b2-role-aware-board-home
```

Read before editing:
- `apps/backstage/src/components/overview/overview-view.tsx` (current widget JSX)
- `apps/backstage/src/components/overview/overview-mock.ts` (mock data shape)
- `apps/backstage/src/routes/_app.index.tsx` (how roles/claims reach the view)
- `apps/backstage/src/lib/authz/is-member-only.ts` (`PRIVILEGED` list pattern)
- `packages/auth/src/roles.ts` (`Role` type, `ROLES` array)

Confirm how the view receives the user's roles today (via auth context / `useAbility`). The helper takes a `Role[]`; wire the view to pass `claims.roles`.

---

### Task 1: `boardHomeLayout` pure helper + types

**Files:**
- Create: `apps/backstage/src/components/overview/board-home-layout.ts`
- Test: `apps/backstage/src/components/overview/board-home-layout.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { boardHomeLayout, type WidgetKey } from "./board-home-layout";

const DEFAULT: WidgetKey[] = [
  "headerActions",
  "kpis",
  "chart",
  "upcomingEvents",
  "recentActivity",
  "quickActions",
];

describe("boardHomeLayout", () => {
  it("Admin gets the full default layout", () => {
    expect(boardHomeLayout(["Admin"])).toEqual(DEFAULT);
  });

  it("Membership leads members-first, keeps quick actions", () => {
    expect(boardHomeLayout(["Membership"])).toEqual([
      "headerActions",
      "kpis",
      "quickActions",
      "recentActivity",
      "chart",
      "upcomingEvents",
    ]);
  });

  it("Treasury hides member quick actions and header create buttons", () => {
    const out = boardHomeLayout(["Treasury"]);
    expect(out).not.toContain("quickActions");
    expect(out).not.toContain("headerActions");
    expect(out[0]).toBe("kpis");
  });

  it("ProjectManager leads with events/projects, drops member admin actions", () => {
    const out = boardHomeLayout(["ProjectManager"]);
    expect(out[0]).toBe("upcomingEvents");
    expect(out).toContain("quickActions");
    expect(out).not.toContain("headerActions");
  });

  it("ExecutiveCommittee is read-only: no quick actions, no header buttons", () => {
    const out = boardHomeLayout(["ExecutiveCommittee"]);
    expect(out).not.toContain("quickActions");
    expect(out).not.toContain("headerActions");
    expect(out).toContain("kpis");
  });

  it("multi-role uses highest-precedence layout, unions visible widgets", () => {
    // Treasury precedence > Membership; but Membership's quickActions union back in
    const out = boardHomeLayout(["Membership", "Treasury"]);
    expect(out[0]).toBe("kpis"); // Treasury order leads
    expect(out).toContain("quickActions"); // unioned from Membership
  });

  it("empty roles fall back to default", () => {
    expect(boardHomeLayout([])).toEqual(DEFAULT);
  });

  it("unknown role falls back to default", () => {
    expect(boardHomeLayout(["Scanner"])).toEqual(DEFAULT);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backstage test board-home-layout`
Expected: FAIL — `board-home-layout` module not found.

- [ ] **Step 3: Write the implementation**

```ts
import type { Role } from "@luminova/auth";

export type WidgetKey =
  | "headerActions"
  | "kpis"
  | "chart"
  | "upcomingEvents"
  | "recentActivity"
  | "quickActions";

const DEFAULT_LAYOUT: WidgetKey[] = [
  "headerActions",
  "kpis",
  "chart",
  "upcomingEvents",
  "recentActivity",
  "quickActions",
];

// Which role's layout wins when a user has several (display precedence, not authority).
const PRECEDENCE: Role[] = [
  "Admin",
  "ExecutiveCommittee",
  "Treasury",
  "ProjectManager",
  "Membership",
];

const ROLE_LAYOUTS: Partial<Record<Role, WidgetKey[]>> = {
  Admin: DEFAULT_LAYOUT,
  Membership: [
    "headerActions",
    "kpis",
    "quickActions",
    "recentActivity",
    "chart",
    "upcomingEvents",
  ],
  Treasury: ["kpis", "recentActivity", "chart"],
  ProjectManager: [
    "upcomingEvents",
    "quickActions",
    "kpis",
    "recentActivity",
  ],
  ExecutiveCommittee: ["kpis", "recentActivity", "chart"],
};

export function boardHomeLayout(roles: readonly Role[]): WidgetKey[] {
  const known = roles.filter((r): r is Role => r in ROLE_LAYOUTS);
  if (known.length === 0) return [...DEFAULT_LAYOUT];

  const lead = PRECEDENCE.find((r) => known.includes(r));
  const leadLayout = lead ? ROLE_LAYOUTS[lead]! : DEFAULT_LAYOUT;

  // Union of every visible widget across the user's known roles.
  const visible = new Set<WidgetKey>();
  for (const r of known) for (const w of ROLE_LAYOUTS[r]!) visible.add(w);

  // Lead role's order first; append any unioned-in widgets in default order.
  const ordered = leadLayout.filter((w) => visible.has(w));
  for (const w of DEFAULT_LAYOUT) {
    if (visible.has(w) && !ordered.includes(w)) ordered.push(w);
  }
  return ordered;
}
```

Note: `r in ROLE_LAYOUTS` narrows safely because the object only has `Role` keys. If `Role` is a string union and TS complains about `in`, use `known = roles.filter((r) => ROLE_LAYOUTS[r] !== undefined)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter backstage test board-home-layout`
Expected: PASS (all cases).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm --filter backstage typecheck
git add apps/backstage/src/components/overview/board-home-layout.ts apps/backstage/src/components/overview/board-home-layout.test.ts
git commit -m "feat(backstage): boardHomeLayout helper for role-aware overview"
```

---

### Task 2: Render Overview widgets from the layout list

**Files:**
- Modify: `apps/backstage/src/components/overview/overview-view.tsx`
- Modify (if needed): `apps/backstage/src/routes/_app.index.tsx` (pass roles into the view)

- [ ] **Step 1: Extract each widget into a keyed renderer map**

In `overview-view.tsx`, refactor the existing JSX so each top-level widget becomes a small local renderer keyed by `WidgetKey`. Do NOT change any widget's markup/data — only move each block behind a key.

```tsx
import { boardHomeLayout, type WidgetKey } from "./board-home-layout";
import type { Role } from "@luminova/auth";

// inside OverviewView, after existing data/props are in scope:
const widgets: Record<WidgetKey, () => ReactNode> = {
  headerActions: () => (/* the existing header create-buttons block */),
  kpis: () => (/* the existing KPI cards grid */),
  chart: () => (/* the existing LineChart block */),
  upcomingEvents: () => (/* the existing upcoming-events section */),
  recentActivity: () => (/* the existing recent-activity feed */),
  quickActions: () => (/* the existing quick-action cards */),
};

const layout = boardHomeLayout(roles);
```

- [ ] **Step 2: Accept `roles` and render in layout order**

Add a `roles: Role[]` prop to `OverviewView` (or read it from the same auth context the route already uses). Replace the hardcoded JSX sequence with:

```tsx
return (
  <div className="…existing page wrapper classes…">
    {layout.map((key) => (
      <Fragment key={key}>{widgets[key]()}</Fragment>
    ))}
  </div>
);
```

Keep the page header/greeting that is NOT a widget outside the map (greeting text stays; only the create-buttons are the `headerActions` widget). Preserve existing spacing/grid classes by wrapping each widget exactly as before.

- [ ] **Step 3: Pass roles from the route**

In `_app.index.tsx`, the route already awaits `context.auth` and checks `isMemberOnly`. Pass the privileged user's roles into `DashboardPage`/`OverviewView`:

```tsx
const claims = context.auth.getState().claims; // or the existing hook used in the component
// …
<OverviewView roles={claims.roles} /* …existing props… */ />
```

Use whatever claims access the component already has — do not add a new auth fetch.

- [ ] **Step 4: Manual + type verification**

Run: `pnpm --filter backstage typecheck`
Expected: PASS.

Run dev and eyeball each role if you can impersonate (optional): Admin = full order; ExecutiveCommittee = no create buttons / no quick actions.

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/components/overview/overview-view.tsx apps/backstage/src/routes/_app.index.tsx
git commit -m "feat(backstage): render board home widgets per role layout"
```

---

### Task 3: Lint, react-best-practices, finalize

- [ ] **Step 1: Lint + full typecheck**

Run:
```bash
pnpm --filter backstage lint
pnpm --filter backstage typecheck
pnpm --filter backstage test board-home-layout
```
Expected: all PASS.

- [ ] **Step 2: react-best-practices pass**

Apply the `react-best-practices` skill to the touched `.tsx`: ensure the `widgets` map is not recreated needlessly (it's fine inline since it closes over render data; do NOT memo-prematurely). Confirm no inline-object prop regressions vs the original.

- [ ] **Step 3: Verification before completion**

Confirm against the spec:
- All five non-default roles produce the mapped order (covered by Task 1 tests).
- No data/query/route/rule/type change (git diff touches only the three files).
- Mocked data untouched.

- [ ] **Step 4: Open PR**

```bash
git push -u origin feat/b2-role-aware-board-home
gh pr create --title "feat(backstage): role-aware board home (B2)" --body "$(cat <<'EOF'
## Summary
- Board home (`/`) now leads with the widgets each privileged role needs.
- Pure `boardHomeLayout(roles)` drives widget order/visibility; widgets unchanged & still mocked (presentation-only).
- Spec: docs/superpowers/specs/2026-06-09-b2-role-aware-board-home-design.md

## Test plan
- [ ] frontend-ci pass (`pnpm --filter backstage test/lint/typecheck`)
- [ ] /security-review — N/A (no auth/rules/functions/data change)
EOF
)"
pnpm pr-tests
```

---

## Self-Review (author)

- **Spec coverage:** role→layout table → Task 1; render-from-list → Task 2; tests → Task 1; no-data-change guard → Task 3. ✓
- **Placeholders:** widget renderer bodies are intentionally "the existing block" — the engineer is told explicitly to MOVE existing markup unchanged, not author new markup. This is a move-refactor, so exact new code can't be pre-written without the file; Step 0 mandates reading it first. ✓
- **Type consistency:** `WidgetKey`, `boardHomeLayout`, `Role` used identically across tasks. ✓
