# @luminova/ui — Claude Code Guide

## Purpose

Shared component library for `apps/spotlight` and `apps/backstage`. Bespoke,
token-driven components styled with **pure Tailwind v4 utility classes** (no
semantic CSS classes). Consumed as **raw TypeScript source** (no build step).

## What's here now (bespoke)

`src/components/`: Button (polymorphic `a|button`, `variant` primary/secondary/ghost,
`onDark`/`onBlue`, `sm`), Icon set + ArrowRight, ArrowLink, Input, Textarea,
Select, Field (label + error), Reveal (IntersectionObserver), SectionHeader,
ImgSlot, LogoLockup (self-contained PNG assets in `src/assets/`), Ripple
(RippleSVG/RippleBackground/RippleDivider), Toast (presentational), Tooltip
(`@radix-ui/react-tooltip`, styled with our tokens). `cn()` in `src/lib/cn.ts`.

Everything is re-exported from `src/index.ts` (explicit named exports — no
`export *`, to satisfy `verbatimModuleSyntax`/`isolatedModules`).

## Deferred (shadcn/Radix complex widgets)

Complex admin widgets — **combobox, dialog, command, table, sheet, popover,
data-table** — are NOT here yet. When backstage needs them, add via shadcn/Radix
(accessibility), styled to the JCI tokens. Keep them in `src/components/` beside
the bespoke set. Tooltip already follows this pattern (Radix primitive + our
utilities, not shadcn's separate theme-var system).

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
