# 0007. A bespoke token-driven `@luminova/ui`

**Status:** Accepted
**Date:** 2026-07 (guide written; the package predates it)
**Source:** `docs/reuse-first-ui.md` "Why this exists"; `packages/ui/DESIGN.md`;
`packages/ui/src/theme.css`; root `eslint.config.js`.

## Context

Two apps with one chapter's brand. The recurring failure was not a missing component
library — it was drift, and `docs/reuse-first-ui.md` names both vectors from experience:

1. **A component gets built a second time because nobody knew the first existed.** Photo
   hooks, cached-async hooks, datetime helpers and 404 chrome *all shipped twice* before
   being deduplicated.
2. **A colour gets typed as a raw hex literal instead of a token**, silently breaking
   dark mode.

Neither is solved by adopting a library. Both are solved by making the shared thing easy
to find and the unshared thing hard to write.

## Decision

A bespoke, token-driven component library built on Tailwind utilities, with
shadcn/Radix pulled in only for complex widgets (dialogs, popovers) via
`pnpm dlx shadcn@latest add` run from `packages/ui`.

- **29 colour tokens** in `theme.css` inside a Tailwind v4 `@theme` block, generating
  utilities (`bg-surface-2`, `text-ink-2`, `border-line`, `text-jci-blue`). Eight brand
  tokens are **locked** — off-brand proposals get flagged, not applied.
- **Five `text-ui-*` type steps**, with a guard against sub-18px type.
- **`DESIGN.md`** is the manifest, structured for Claude Design ingest.

The conventions are **enforced by eslint, not by review**:

- raw hex / `rgba` in `className` → error
- raw `<input>`, `<textarea>`, `<select>`, `<table>` in app code → error
- sub-18px type → error

## Consequences

**Easy:** dark mode works everywhere because nothing hard-codes a colour; the brand is
consistent without anyone policing it; a new screen is mostly assembly.

**Hard:**

- **The catalog has to be discoverable or the guard just annoys people.** An eslint rule
  that blocks `<input>` without telling you what to use instead is a tax. That is what
  `reuse-first-ui.md`'s quick-index and the pre-add checklist are for.
- **Adding a token or component has a process.** Deliberately — the pre-add checklist
  exists so the answer to "is this missing?" is usually "no, look again".
- **Complex widgets are a mixed model.** Some components are ours, some are Radix
  underneath. Anything used as an `asChild` trigger must `forwardRef` and spread props,
  which is a real trap that has broken components before.

**Ruled out:** shadcn-first. The generated components do not carry the chapter's tokens,
and a copy-in library reintroduces vector 1 — many near-identical components, no
canonical one.
