# UI polish — FX1 table UX, FX2 dark mode, FX3 ⌘K palette, FX4 sidebar collapse

**Date:** 2026-06-07
**App:** `apps/backstage` + `@luminova/ui`
**Status:** design approved (decisions locked), pending spec review

Closes roadmap **FX1–FX4** (and the **E3** command-palette + **E6** DataTable widget
gaps they depend on). Ships as **3 PRs, all off `main`** (independent; no inter-stack).

## Decisions (locked)

| Topic | Decision |
|---|---|
| PR topology | **3 PRs off `main`**: A = Shell prefs (dark mode + sidebar collapse, shared pref store); B = DataTable (E6) + Members adoption (FX1); C = Command palette (E3) + ⌘K (FX3). |
| FX1 | Build a reusable **`DataTable`** (E6) in `@luminova/ui`; adopt on Members first. |
| FX3 | Build a **`CommandPalette`** (E3) in `@luminova/ui` (cmdk); backstage wires nav **and** quick actions, ability-filtered. |
| FX2 | **Backstage only.** Dark token scheme in `@luminova/ui/theme.css`; backstage opts in via `data-theme`. Default **follows `prefers-color-scheme`**, user override persisted. Spotlight stays light. |

## Key context

- **No dark tokens exist** — `theme.css` has only the light palette. FX2 adds a real
  `[data-theme="dark"]` override block (not just a toggle).
- **No UI-pref store** — FX2 (theme) and FX4 (collapse) share one tiny persisted hook.
- Topbar already renders a **non-functional ⌘K affordance** (FX3 wires it).
- Tables have **no search/sort/filter** (FX1). `cmdk@^1.1.1` is already a `@luminova/ui`
  dep (via Combobox). `Icon.sidebarLeft` + `Tooltip` already exist.
- Palette commands derive from `NAV_GROUPS` (`components/nav-config.ts`), already
  ability/role-filtered in the sidebar.

## Non-goals

Mobile sidebar overlay/responsive shell (separate concern), dark mode for Spotlight,
server-side table pagination (deferred until a collection > ~1–2k docs), theming the
locked brand colors (only neutrals invert).

---

## PR-A — Shell prefs: dark mode (FX2) + sidebar collapse (FX4)

**Base:** `main`. Branch: `feat/shell-prefs`.

### Shared unit — persisted UI prefs

- Create `apps/backstage/src/lib/ui-prefs.ts` — a minimal `localStorage`-backed store
  exposed via `useSyncExternalStore` (mirrors the existing `auth-store` pattern; no new
  dep, no zustand). Keys: `theme: "light" | "dark" | "system"` and
  `sidebarCollapsed: boolean`. SSR-safe guards (this is a SPA, but guard `window`).
  - `getThemePref()` / `setThemePref(v)`, `getSidebarCollapsed()` / `setSidebarCollapsed(v)`,
    `subscribe(fn)`. One module, one responsibility (persisted UI prefs).

### Dark mode (FX2)

- `@luminova/ui/theme.css` — add a `[data-theme="dark"]` block that overrides the
  **neutral** custom properties only (brand palette stays locked):
  `--color-surface`, `--color-surface-2`, `--color-surface-3`, `--color-ink-1/2/3`,
  `--color-line`, `--color-line-strong`. Tailwind v4 utilities already emit
  `var(--color-…)`, so overriding the vars under the selector flips `bg-surface`,
  `text-ink-1`, `border-line`, etc. with no per-component `dark:` variants.
  Dark values (derived from the brand `jci-black` family, not invented brand hues):
  surface `#16132b`, surface-2 `#1d1936`, surface-3 `#262141`, ink-1 `#f4f2fb`,
  ink-2 `rgba(244,242,251,.74)`, ink-3 `rgba(244,242,251,.54)`,
  line `rgba(255,255,255,.10)`, line-strong `rgba(255,255,255,.18)`.
- Add a `<ThemeController>` mounted in `__root.tsx` (so both `_auth` and `_app` honor
  the theme): reads `ui-prefs`,
  sets `document.documentElement.dataset.theme` to the resolved theme, and when pref is
  `"system"` subscribes to `matchMedia("(prefers-color-scheme: dark)")` to live-update.
- **Toggle**: a `SegmentedControl` (exists) Claro / Oscuro / Sistema in the **sidebar
  footer** (next to the user/logout block, since `/settings` D4 isn't built). Writes
  `ui-prefs.setThemePref`.
- Known limitation (documented, not fixed): a few components use hardcoded `rgba(19,15,45,…)`
  shadows/tints that won't invert. Acceptable for v1; brand contrast preserved.

### Sidebar collapse (FX4)

- `app-sidebar.tsx` — width driven by `getSidebarCollapsed()`: expanded `w-[264px]`,
  collapsed `w-[72px]` icon-rail (hide group labels + item text + user text; center icons;
  wrap each nav item in the existing `Tooltip` showing its label on hover when collapsed).
- `_app.tsx` — grid first column tracks collapsed state:
  `grid-cols-[72px_1fr]` vs `grid-cols-[264px_1fr]` (read pref via `useSyncExternalStore`).
- **Toggle**: an `IconButton` (`Icon.sidebarLeft`) in the topbar left (or sidebar header)
  flipping `ui-prefs.setSidebarCollapsed`.

### Testing (PR-A)

- `ui-prefs.test.ts` — get/set round-trips through localStorage; subscribe fires on change;
  defaults (`system`, not collapsed) when storage empty/corrupt.
- `theme-controller.test.tsx` — sets `data-theme` from pref; `"system"` resolves via a
  mocked `matchMedia`.
- `app-sidebar.test.tsx` — collapsed hides labels / shows tooltips; expanded shows labels.

---

## PR-B — DataTable (E6) + Members adoption (FX1)

**Base:** `main`. Branch: `feat/datatable`.

### New unit — `@luminova/ui` `DataTable`

- `packages/ui/src/components/data-table.tsx` — a **client-side** generic table
  (≤ ~hundreds of rows). Distinct from the primitive `Table` (which it composes).
  Props:
  ```ts
  interface DataTableColumn<T> {
    id: string;
    header: string;
    cell: (row: T) => ReactNode;
    sortValue?: (row: T) => string | number;   // omit → not sortable
    sortable?: boolean;
  }
  interface FilterChip { id: string; label: string; active: boolean }
  interface DataTableProps<T> {
    rows: T[];
    columns: DataTableColumn<T>[];
    getRowId: (row: T) => string;
    searchText?: (row: T) => string;            // omit → no search box
    searchPlaceholder?: string;
    chips?: FilterChip[];
    chipPredicate?: (row: T, activeChipIds: string[]) => boolean;
    onRowClick?: (row: T) => void;
    isLoading?: boolean;                        // → Skeleton rows
    emptyState?: ReactNode;                     // → EmptyState
    rowActions?: (row: T) => ReactNode;
  }
  ```
  - State (search query, sort `{columnId, dir}`, active chip ids) is **internal**;
    derive the visible rows with `useMemo` (search → chip filter → sort).
  - Header cells with `sortValue` render a sort affordance (`Icon.chevExpand` / a
    rotating chevron) and cycle asc → desc → none.
  - Pure helpers extracted + unit-tested: `applySearch`, `applyChips`, `applySort`.
  - Loading → `Skeleton` rows; empty → `EmptyState`. Export from `src/index.ts`;
    update `DESIGN.md` + ui `CLAUDE.md` count (29 → 30) and the E6 row.
- **A11y:** sortable `<th>` is a `<button>` with `aria-sort`; search is a labelled input.

### Members adoption (FX1)

- Replace the hand-rolled `MemberTable` body with `DataTable`: columns
  (name, role, status badge, points, joinDate), `searchText` = name+email+role,
  `chips` = status (`Activo` / `Inactivo` / `Desafiliado`) — matches the design's
  Members filter-chips spec. Keep the existing `rowActions` (view/edit/delete) +
  ability gating. Preserve the public `MemberTable` props so the route is unchanged.

### Testing (PR-B)

- `data-table.test.ts` — `applySearch`/`applyChips`/`applySort` pure-helper cases.
- `data-table.test.tsx` — typing filters rows; chip toggles; clicking a sortable header
  sorts asc→desc; loading shows skeleton; empty shows the empty state.
- Existing `member-table.test.tsx` updated for the new markup (badge + name still
  assert; add a search-filters-rows case).

---

## PR-C — Command palette (E3) + ⌘K (FX3)

**Base:** `main`. Branch: `feat/command-palette`.

### New unit — `@luminova/ui` `CommandPalette`

- `packages/ui/src/components/command-palette.tsx` — wraps **cmdk** + the existing
  `Dialog`/token styling. Presentational + controlled:
  ```ts
  interface CommandItem {
    id: string;
    label: string;
    group: string;
    icon?: ReactNode;
    keywords?: string[];
    onSelect: () => void;
  }
  interface CommandPaletteProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    items: CommandItem[];
    placeholder?: string;
    emptyText?: string;
  }
  ```
  - Groups items by `group`; cmdk handles fuzzy search + keyboard nav. Selecting an item
    calls `onSelect` then closes. Export from `src/index.ts`; bump DESIGN.md/CLAUDE.md
    (30 → 31) + close the E3 row. cmdk stays a static dep (already imported by Combobox).

### Backstage wiring

- `apps/backstage/src/components/command-menu.tsx` — owns `open` state + the global
  **⌘K / Ctrl-K** key listener (and `/` optional), builds `items` from:
  - **Navigation**: `NAV_GROUPS` items the caller may see (reuse the sidebar's
    `ability.can` + `hasAnyRole` filter) → `onSelect` = `navigate({ to })`.
  - **Actions** (ability-gated): "Crear evento" (`/activities` + open create),
    "Invitar miembro" (`/members` + open create), "Ir a mi panel". Actions that open a
    create sheet navigate with a search flag the target route already understands, or
    simply navigate (v1: navigate-only where a cross-route open is awkward — documented).
- Mount `<CommandMenu>` in `_app.tsx`. Make the topbar's existing ⌘K affordance a real
  `<button>` that opens it (remove `aria-hidden`).

### Testing (PR-C)

- `command-palette.test.tsx` (ui) — renders groups; typing filters; selecting calls
  `onSelect` + `onOpenChange(false)`.
- `command-menu.test.tsx` (backstage) — ⌘K opens; a nav item navigates; an item the
  ability denies is absent. (Mock router `navigate` + ability.)

---

## Architecture notes

- **Isolation:** `ui-prefs` (persistence), `DataTable` (table behavior), `CommandPalette`
  (command UI) are each one well-bounded unit with a typed interface, independently
  testable. Backstage glue (`ThemeController`, `CommandMenu`, Members adoption) stays thin.
- **No new deps.** cmdk already present; everything else is React + existing `@luminova/ui`.
- **Brand tokens stay locked** — dark mode overrides neutrals only.

## Risks

- **Dark mode hardcoded rgbas** — a few component shadows/tints won't invert; v1
  limitation, documented in `DESIGN.md`. Follow-up: migrate them to tokens.
- **DataTable adoption churn** — only Members adopts in PR-B; Allies/Events follow later
  (each its own small PR) to keep PR-B reviewable.
- **Palette cross-route "open create"** — v1 may navigate-only for actions where opening
  a sheet on another route needs new plumbing; flagged, not silently dropped.

## PR sequencing

All three branch off `main` and can land in any order (independent). Suggested review
order: A (shell, most-seen) → B (tables) → C (palette). Each: brainstorm done → plan →
TDD → CI + `bundle-budget-watcher` (B and C add `@luminova/ui` exports) → PR.
