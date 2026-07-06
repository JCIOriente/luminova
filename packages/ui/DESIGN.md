# @luminova/ui — Design System Manifest (for Claude Design)

This file is the ingest manifest for **Claude Design** (claude.ai/design). When
this repo is linked/uploaded, Claude Design reads this package as the JCI Oriente
design system: the **tokens** below are the foundation, and each **component**
points at its source of truth.

> Intent: keep a single design system so any future site (marketing, microsite,
> internal tool) is built by **reusing these components**, not reinventing them.

**Authoring note for Claude Design — design these yourself.**

Treat the component source as a **functional contract**, not a visual spec. From
each source file take only:

- which components exist and their **names**,
- their **props / variants / states** (e.g. Button has primary/secondary/ghost,
  `onDark`/`onBlue`, `sm`; Badge has tones; KpiCard has tone + trend + optional icon),
- their **structure / parts** (e.g. Table = Header/Body/Row/Head/Cell).

**Do not copy the existing Tailwind utility classes or visual styling** — that is
the current implementation, not a design directive. Design the look, spacing,
proportions, interaction states, and composition **yourself**. The goal is your
best design work, not a clone of the repo's current CSS.

The **one thing to honor** is the brand foundation: the **locked color palette**
and **typography** in `src/theme.css` (see below). Everything else is open.

---

## Foundation — design tokens

Single source of truth: **`src/theme.css`** (Tailwind v4 `@theme` block). Read it
directly for exact values. Summary of what's defined:

| Group               | Tokens                                                                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Brand (locked)**  | `jci-blue` `#0097d7`, `jci-blue-2` `#0086c0`, `jci-black` `#130f2d`, `jci-white` `#ffffff`, `jci-navy` `#1f4789`, `jci-teal` `#57bcbc`, `jci-yellow` `#efc40f`, `bone` `#f4f1ea` |
| **Surfaces**        | `surface` `#ffffff`, `surface-2` `#f7f9fb`, `surface-3` `#eef2f6`                                                                                                                |
| **Lines**           | `line` `rgba(19,15,45,.08)`, `line-strong` `rgba(19,15,45,.16)`                                                                                                                  |
| **Ink (text)**      | `ink-1` `#130f2d`, `ink-2` `rgba(19,15,45,.72)`, `ink-3` `rgba(19,15,45,.52)`, `ink-4` `rgba(19,15,45,.32)`                                                                      |
| **Semantic status** | `ok` `#1f8a5b`, `error` `#c0392b`, `warn` `#8e7300`, `teal-ink` `#2e8c8c`                                                                                                        |
| **Type**            | sans `Plus Jakarta Sans`, serif `Arvo`, mono `JetBrains Mono`                                                                                                                    |
| **Radii**           | `card` `12px`, `pill` `9999px`                                                                                                                                                   |
| **Motion**          | `ripple-spin`, `toast-in`, `skeleton`, `rise`, `overlay-in/out`, `sheet-in/out` (right slide-over), `dialog-in/out` (centered zoom), `menu-in/out` (keyframes in `theme.css`); all overlay motion is `motion-reduce:animate-none` |

**Dark mode:** a `[data-theme="dark"]` block in `theme.css` overrides the **neutral
tokens only** (surface/ink/line); brand colors stay locked. A few hardcoded
`rgba(19,15,45,…)` shadows don't invert yet — accepted for v1.

**Brand assets:** `src/assets/` — `logo-black.png`, `logo-color.png`,
`logo-on-blue.png`, `logo-on-dark.png` (rendered via the `LogoLockup` component).

Styling model: **pure Tailwind v4 utility classes** driven by these tokens (no
semantic CSS classes). Components are consumed as **raw TypeScript source** — no
build step.

### Type scale — two families

**Brand scale (fluid; marketing / hero).** `clamp()`-based, scales with the
viewport. Use on spotlight and admin hero surfaces.

| Utility          | Value                      | Use                        |
| ---------------- | -------------------------- | -------------------------- |
| `text-display`   | `clamp(40px, 6.8vw, 72px)` | Hero statements            |
| `text-title`     | `clamp(32px, 4.4vw, 48px)` | Page / section titles      |
| `text-subtitle`  | `clamp(20px, 1.7vw, 24px)` | Standfirsts, lead-ins      |
| `text-quote`     | `clamp(22px, 2.6vw, 32px)` | Pull quotes                |

**Compact admin scale (fixed px; density).** Five steps for `apps/backstage`
tables, forms, cards, meta. **Named by size, not role** — one size legitimately
carries several roles (13px is body _and_ label _and_ caption), so pick the
token by size and carry intent with weight + color + tracking. Each ships a
default `line-height`; an explicit `leading-*` utility still overrides it
(Tailwind v4). Reading tiers (`xs`/`sm`) run `1.5` for wrapping comfort;
single-line tiers (`2xs`/`lg`) run tight so badges and headings don't bloat.
Floor is **11px** — never smaller.

| Utility       | Size / LH | Typical use                                             |
| ------------- | --------- | ------------------------------------------------------- |
| `text-ui-2xs` | 11 / 1.35 | Uppercase eyebrows, tags, badges, kbd, month abbr (600) |
| `text-ui-xs`  | 12 / 1.5  | Helper text, secondary meta, timestamps                 |
| `text-ui-sm`  | 13 / 1.5  | **Workhorse** — table body, form labels, descriptions   |
| `text-ui-md`  | 14 / 1.45 | Emphasized body, nav items, values                      |
| `text-ui-lg`  | 15 / 1.3  | Member names, section subheads, small headings (600)    |

Sizes **≥18px** (page/hero titles, KPI stat numerals, date-chip day numbers)
stay **component-owned literals**, deliberately outside this scale — a compact
density scale shouldn't own one-off display type. See the type-density preview
at `packages/ui/preview/type-density.html`.

**A11y note (pre-existing, tracked):** `ink-3` on white is ~3.76:1 and `ink-4`
~2.1:1 — below WCAG AA 4.5:1 for normal text. The compact scale is color-neutral
(it changed no ink pairings); recoloring `ink-3` is a separate token decision.

---

## Components (37 — shipped)

All exported from `src/index.ts` except the QR pair (deep-imported to stay in lazy
chunks). Paths are relative to `packages/ui/src/`.

### Form / inputs

| Component                                                                                       | Source                              |
| ----------------------------------------------------------------------------------------------- | ----------------------------------- |
| `Button` (variants: primary/secondary/ghost, `onDark`/`onBlue`, `sm`; polymorphic `a`/`button`) | `components/button.tsx`             |
| `Input`                                                                                         | `components/input.tsx`              |
| `SearchInput` (leading icon; `label` sr-only required, `size` md/sm)                            | `components/search-input.tsx`       |
| `Textarea`                                                                                      | `components/textarea.tsx`           |
| `Select`                                                                                        | `components/select.tsx`             |
| `Field` (label + error wrapper)                                                                 | `components/field.tsx`              |
| `Checkbox` (label + branded box)                                                                | `components/checkbox.tsx`           |
| `Combobox` (single-select + search)                                                             | `components/combobox.tsx`           |
| `MultiSelect` (multi-select + chips)                                                            | `components/multi-select-field.tsx` |
| `DatePicker` (calendar popover, `yyyy-MM-dd`; month/year dropdown caption)                      | `components/date-picker.tsx`        |
| `DateTimePicker` (calendar popover + time, `yyyy-MM-ddTHH:mm`)                                  | `components/date-picker.tsx`        |

### Feedback / status

| Component                            | Source                       |
| ------------------------------------ | ---------------------------- |
| `Badge` (tones)                      | `components/badge.tsx`       |
| `Skeleton`                           | `components/skeleton.tsx`    |
| `Toast`                              | `components/toast.tsx`       |
| `Tooltip` (Radix primitive + tokens) | `components/tooltip.tsx`     |
| `EmptyState`                         | `components/empty-state.tsx` |

### Overlays

| Component                                     | Source                   |
| --------------------------------------------- | ------------------------ |
| `Dialog` — `hideHeader` (sr-only title, for self-chromed modals), `overlayClassName`/`contentClassName` overrides | `components/dialog.tsx` |
| `Sheet` — `size sm|md|lg|xl (440/560/680/800px, default sm)` | `components/sheet.tsx`   |
| `Popover` (Radix; backs Combobox/MultiSelect) | `components/popover.tsx` |
| `Menu` / `MenuItem` / `MenuSeparator` (Radix DropdownMenu; row/⋯ action menus, keyboard nav) | `components/menu.tsx` |
| `CommandPalette` (⌘K; cmdk dialog + groups + fuzzy filter) | `components/command-palette.tsx` |

### Data display
| Component | Source |
|-----------|--------|
| `Table` (+ `TableHeader/Body/Row/Head/Cell`) | `components/table.tsx` |
| `DataTable` (client search / sort / filter-chips / skeleton + empty; composes `Table`) | `components/data-table.tsx` |
| `KpiCard` (tone + trend, icon optional) | `components/kpi-card.tsx` |
| `LineChart` | `components/line-chart-view.tsx` (data: `components/line-chart.ts`) |
| `Sparkline` | `components/sparkline-chart.tsx` (data: `components/sparkline.ts`) |
| `ProgressBar` (`value` 0–100 clamped, `label?`, `className?`; ARIA progressbar role) | `components/progress-bar.tsx` |

### People / presence

| Component | Source |
|-----------|--------|
| `Avatar` (`src`, `name`, `size?`, `className?`; initials fallback) | `components/avatar.tsx` |
| `AvatarStack` (`people:{name,src?}[]`, `max?`, `size?`, `className?`; +N overflow chip with aria-label) | `components/avatar-stack.tsx` |

### Structure / brand

| Component                                             | Source                          |
| ----------------------------------------------------- | ------------------------------- |
| `Card` (`as`, `padding` md/sm/row/none, `interactive`; + `cardSurfaceClasses`/`cardInteractiveClasses` for button/link hosts) | `components/card.tsx` |
| `SectionHeader`                                       | `components/section-header.tsx` |
| `ArrowLink`                                           | `components/arrow-link.tsx`     |
| `LogoLockup`                                          | `components/logo-lockup.tsx`    |
| `ImgSlot` (image placeholder)                         | `components/img-slot.tsx`       |
| `Icon` + `ArrowRight` (icon set)                      | `components/icons.tsx`          |
| `Reveal` (scroll-in animation)                        | `components/reveal.tsx`         |
| `Ripple` (`RippleSVG/RippleBackground/RippleDivider`) | `components/ripple.tsx`         |

### Domain widgets (deep-import only)

| Component   | Source                                                  |
| ----------- | ------------------------------------------------------- |
| `QrCode`    | `components/qr-code.tsx` → `@luminova/ui/qr-code`       |
| `QrScanner` | `components/qr-scanner.tsx` → `@luminova/ui/qr-scanner` |

---

## Candidate components (roadmap — not built yet)

Designing these ahead in Claude Design is welcome; they're on the product roadmap
(`docs/roadmap.md`) but have no source here yet. Same tokens apply.

- ~~**DataTable** (sort / filter / skeleton + filter-chips) — E6 / FX1~~ ✅ shipped (`components/data-table.tsx`); server-side pagination deferred
- ~~**Command palette** (⌘K) — E3 / FX3~~ ✅ shipped (`components/command-palette.tsx`)
- **Sidebar** (collapsible) + **Topbar** (notification bell) — FX4 / K1
- **Dark-mode variants** of the full set — FX2
- **Notification center / activity feed** — K1
- ~~**Avatar / profile picture** — H1~~ ✅ shipped (`components/avatar.tsx`, `components/avatar-stack.tsx`)
- Common gaps any new site will hit: **Tabs, Radio, Switch, Date picker**
  (Dropdown menu ✅ `Menu`; Checkbox ✅; client Pagination ✅ via `DataTable`)

---

## How this gets into Claude Design

There is **no terminal → Claude Design push** (no MCP/CLI bridge). The sync is
manual and happens in the product:

1. Open **claude.ai/design** → your organization.
2. **Link or upload this repository** (org settings / onboarding):
   `https://github.com/JCIOriente/luminova`
3. Claude Design reads `packages/ui` guided by this manifest + `src/theme.css`.
4. To update later: design system → **Open → Remix** → chat the changes.
