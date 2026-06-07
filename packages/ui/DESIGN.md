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
  `onDark`/`onBlue`, `sm`; Badge has tones; KpiCard has tone + trend),
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

| Group | Tokens |
|-------|--------|
| **Brand (locked)** | `jci-blue` `#0097d7`, `jci-blue-2` `#0086c0`, `jci-black` `#130f2d`, `jci-white` `#ffffff`, `jci-navy` `#1f4789`, `jci-teal` `#57bcbc`, `jci-yellow` `#efc40f`, `bone` `#f4f1ea` |
| **Surfaces** | `surface` `#ffffff`, `surface-2` `#f7f9fb`, `surface-3` `#eef2f6` |
| **Lines** | `line` `rgba(19,15,45,.08)`, `line-strong` `rgba(19,15,45,.16)` |
| **Ink (text)** | `ink-1` `#130f2d`, `ink-2` `rgba(19,15,45,.72)`, `ink-3` `rgba(19,15,45,.52)` |
| **Semantic status** | `ok` `#1f8a5b`, `error` `#c0392b`, `warn` `#8e7300`, `teal-ink` `#2e8c8c` |
| **Type** | sans `Plus Jakarta Sans`, serif `Arvo`, mono `JetBrains Mono` |
| **Radii** | `card` `12px`, `pill` `9999px` |
| **Motion** | `ripple-spin`, `toast-in`, `skeleton`, `rise` (keyframes in `theme.css`) |

**Brand assets:** `src/assets/` — `logo-black.png`, `logo-color.png`,
`logo-on-blue.png`, `logo-on-dark.png` (rendered via the `LogoLockup` component).

Styling model: **pure Tailwind v4 utility classes** driven by these tokens (no
semantic CSS classes). Components are consumed as **raw TypeScript source** — no
build step.

---

## Components (28 — shipped)

All exported from `src/index.ts` except the QR pair (deep-imported to stay in lazy
chunks). Paths are relative to `packages/ui/src/`.

### Form / inputs
| Component | Source |
|-----------|--------|
| `Button` (variants: primary/secondary/ghost, `onDark`/`onBlue`, `sm`; polymorphic `a`/`button`) | `components/button.tsx` |
| `Input` | `components/input.tsx` |
| `Textarea` | `components/textarea.tsx` |
| `Select` | `components/select.tsx` |
| `Field` (label + error wrapper) | `components/field.tsx` |
| `Combobox` (single-select + search) | `components/combobox.tsx` |
| `MultiSelect` (multi-select + chips) | `components/multi-select-field.tsx` |

### Feedback / status
| Component | Source |
|-----------|--------|
| `Badge` (tones) | `components/badge.tsx` |
| `Skeleton` | `components/skeleton.tsx` |
| `Toast` | `components/toast.tsx` |
| `Tooltip` (Radix primitive + tokens) | `components/tooltip.tsx` |
| `EmptyState` | `components/empty-state.tsx` |

### Overlays
| Component | Source |
|-----------|--------|
| `Dialog` | `components/dialog.tsx` |
| `Sheet` | `components/sheet.tsx` |
| `Popover` (Radix; backs Combobox/MultiSelect) | `components/popover.tsx` |

### Data display
| Component | Source |
|-----------|--------|
| `Table` (+ `TableHeader/Body/Row/Head/Cell`) | `components/table.tsx` |
| `KpiCard` (tone + trend) | `components/kpi-card.tsx` |
| `LineChart` | `components/line-chart-view.tsx` (data: `components/line-chart.ts`) |
| `Sparkline` | `components/sparkline-chart.tsx` (data: `components/sparkline.ts`) |

### Structure / brand
| Component | Source |
|-----------|--------|
| `SectionHeader` | `components/section-header.tsx` |
| `ArrowLink` | `components/arrow-link.tsx` |
| `LogoLockup` | `components/logo-lockup.tsx` |
| `ImgSlot` (image placeholder) | `components/img-slot.tsx` |
| `Icon` + `ArrowRight` (icon set) | `components/icons.tsx` |
| `Reveal` (scroll-in animation) | `components/reveal.tsx` |
| `Ripple` (`RippleSVG/RippleBackground/RippleDivider`) | `components/ripple.tsx` |

### Domain widgets (deep-import only)
| Component | Source |
|-----------|--------|
| `QrCode` | `components/qr-code.tsx` → `@luminova/ui/qr-code` |
| `QrScanner` | `components/qr-scanner.tsx` → `@luminova/ui/qr-scanner` |

---

## Candidate components (roadmap — not built yet)

Designing these ahead in Claude Design is welcome; they're on the product roadmap
(`docs/roadmap.md`) but have no source here yet. Same tokens apply.

- **DataTable** (sort / filter / paginate / skeleton + filter-chips) — E6 / FX1
- **Command palette** (⌘K) — E3 / FX3
- **Sidebar** (collapsible) + **Topbar** (notification bell) — FX4 / K1
- **Dark-mode variants** of the full set — FX2
- **Notification center / activity feed** — K1
- **Avatar / profile picture** — H1
- Common gaps any new site will hit: **Tabs, Dropdown menu, Checkbox, Radio,
  Switch, Pagination, Date picker**

---

## How this gets into Claude Design

There is **no terminal → Claude Design push** (no MCP/CLI bridge). The sync is
manual and happens in the product:

1. Open **claude.ai/design** → your organization.
2. **Link or upload this repository** (org settings / onboarding):
   `https://github.com/JCIOriente/luminova`
3. Claude Design reads `packages/ui` guided by this manifest + `src/theme.css`.
4. To update later: design system → **Open → Remix** → chat the changes.
