# @luminova/ui — Claude Code Guide

## Purpose

Shared component library for `apps/spotlight` and `apps/backstage`. Bespoke,
token-driven components styled with **pure Tailwind v4 utility classes** (no
semantic CSS classes). Consumed as **raw TypeScript source** (no build step).

## What's here now (28 components)

Full inventory + source paths + design tokens live in **`DESIGN.md`** (the
ingest manifest for Claude Design). Quick map:

- **Form / inputs:** Button (polymorphic `a|button`, `variant`
  primary/secondary/ghost, `onDark`/`onBlue`, `sm`), Input, Textarea, Select,
  Field (label + error), Combobox (single-select + search), MultiSelect (chips).
- **Feedback / status:** Badge (tones), Skeleton, Toast (presentational),
  Tooltip (Radix + tokens), EmptyState.
- **Overlays:** Dialog, Sheet, Popover (Radix; backs Combobox/MultiSelect).
- **Data display:** Table (+ TableHeader/Body/Row/Head/Cell), KpiCard (tone +
  trend), LineChart, Sparkline.
- **Structure / brand:** Icon set + ArrowRight, ArrowLink, SectionHeader,
  ImgSlot, LogoLockup (PNG assets in `src/assets/`), Reveal
  (IntersectionObserver), Ripple (RippleSVG/RippleBackground/RippleDivider).
- **Domain widgets (deep-import):** QrCode (`@luminova/ui/qr-code`), QrScanner
  (`@luminova/ui/qr-scanner`) — kept out of the barrel so `qrcode.react`/`@zxing`
  stay in lazy chunks.

`cn()` in `src/lib/cn.ts`. Everything except the QR pair is re-exported from
`src/index.ts` (explicit named exports — no `export *`, to satisfy
`verbatimModuleSyntax`/`isolatedModules`).

## Deferred (not built yet)

Roadmap widgets still missing — add via shadcn/Radix (accessibility), styled to
the JCI tokens, beside the bespoke set:

- **Command palette** (⌘K) — E3 / FX3 (cmdk already a dep via Combobox).
- **DataTable** (sort / filter / paginate / skeleton + filter-chips) — E6 / FX1
  (distinct from the primitive `Table` above).

Pattern for new Radix-backed widgets: wrap the primitive + our token utilities,
not shadcn's separate theme-var system (as Tooltip/Popover/Dialog do).

## Design tokens — `src/theme.css`

Single source of truth. Tailwind v4 `@theme` block: brand colors + ink/surface/
line (as `--color-*` → `text-ink-2`, `bg-surface`, `border-line` utilities),
fonts (`font-sans/serif/mono`), radii (`rounded-card/pill`), and the
`ripple-spin` / `toast-in` animations. Exported as `@luminova/ui/theme.css`.

## Consuming this package (apps)

```css
/* app's entry CSS, in order */
@import "tailwindcss";
@import "@luminova/ui/theme.css";
@source "../../../packages/ui/src/**/*.{ts,tsx}";   /* REQUIRED */
```

The `@source` line is **mandatory** — without it Tailwind purges the utility
classes used inside `@luminova/ui` components and they render unstyled. Path is
relative to the app's CSS file (3 levels up to repo root → `packages/ui/src`).

Then `pnpm --filter <app> add "@luminova/ui@workspace:*"` and
`import { Button, Input, … } from "@luminova/ui"`.

## Conventions

- **Pure Tailwind utilities** in components; use `cn()` to merge/override
  (tailwind-merge resolves conflicts — order matters: append overrides last).
- **React is a peerDependency** (singleton) — never bundle React here.
- **No semantic CSS classes** for shared components (those stay app-local for
  marketing-specific styling, e.g. spotlight's `.area-card`, `.site-header`).
- **Reduced motion**: animated components use `motion-reduce:*` variants. Apps
  should also keep a global `@media (prefers-reduced-motion)` reset.
- Add a dependency only via the `secure-dep-vetting` skill.

## Rules

- Don't reintroduce a build step — apps import the raw `.ts`/`.tsx` source.
- Every new export must be added to `src/index.ts` and consumed by an app or the
  smoke test (knip flags unused exports).
- Keep brand fidelity: components mirror the Claude Design handoff's visual spec.
