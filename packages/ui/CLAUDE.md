# @luminova/ui — Claude Code Guide

## Purpose

Shared components for `apps/spotlight` and `apps/backstage`: bespoke, token-driven, **pure Tailwind v4 utilities** (no semantic CSS classes; app-local ones like spotlight's `.area-card` stay in the app), consumed as **raw TypeScript source** (no build step).

## Components

- Source of truth for what exists: the barrel `src/index.ts`; inventory, source paths and tokens in **`DESIGN.md`** (don't hard-code a component count here).
- Barrel uses explicit named exports — no `export *` (`verbatimModuleSyntax`/`isolatedModules`).
- Heavy-dep widgets stay out of the barrel as deep-import subpaths (`@luminova/ui/qr-code`, `@luminova/ui/qr-scanner`) so their deps stay in lazy chunks.
- New complex widgets: shadcn/Radix (a11y), wrapping the primitive with our token utilities — not shadcn's separate theme-var system (as Tooltip/Popover/Dialog do).
- Server-side table pagination stays deferred until a collection exceeds ~1–2k docs.

## Design tokens — `src/theme.css`

Single source of truth (Tailwind v4 `@theme`), exported as `@luminova/ui/theme.css`.

**Two type scales.** Brand/fluid (`text-display/title/subtitle/quote`) for marketing + hero; compact/fixed `text-ui-2xs|xs|sm|md|lg` (11–15px) for backstage density. Pick by size, carry intent with weight + color. Floor 11px. App code must not use arbitrary `text-[Npx]` for N<18 (eslint `no-restricted-syntax` in `eslint.config.js`); sizes ≥18px are component-owned display literals. Full table in `DESIGN.md`.

## Claude Design sync

Coded half of a **Claude Design** (claude.ai/design) system — process in [`docs/tooling/claude-design-handoff.md`](../../docs/tooling/claude-design-handoff.md).

- **`DESIGN.md`** is the ingest manifest. Update it whenever a component is added/removed.
- **Ingesting a redesign:** brainstorm + scope first, reconcile tokens (`theme.css`) as the foundation batch, then migrate components **by category in batches**, delta-driven.
- **Translate, don't copy.** Components mirror the handoff's visual spec (brand fidelity). Re-express the handoff's semantic `jci-*` CSS in pure Tailwind utilities. Never add the handoff's CSS system to the repo.
- **Preserve public APIs** so usage sites absorb a redesign with no churn; new props optional.
- **Brand tokens are locked** — flag off-brand proposals, don't apply silently.
- **Component library ≠ Spotlight pages.** Migrate the library first; brainstorm page redesigns separately.

## Consuming this package (apps)

```css
/* app's entry CSS, in order */
@import "tailwindcss";
@import "@luminova/ui/theme.css";
@source "../../../packages/ui/src/**/*.{ts,tsx}"; /* REQUIRED */
```

The `@source` line is **mandatory** — without it Tailwind purges the classes used inside `@luminova/ui` and components render unstyled. Path is relative to the app's CSS file.

Then `pnpm --filter <app> add "@luminova/ui@workspace:*"`.

## Rules

- Merge/override classes with `cn()` (`src/lib/cn.ts`); append overrides last.
- **React is a peerDependency** — never bundle React here.
- `animate-spin` sets the `animation` shorthand, which overrides an arbitrary `[animation-duration:X]` on the same element; for a slow spin use the `animate-ripple-spin` token.
- Animated components use `motion-reduce:*` variants; apps keep a global `@media (prefers-reduced-motion)` reset.
- Every new export goes in `src/index.ts` and must be consumed by an app or the smoke test `src/index.test.ts` (knip flags unused exports).
