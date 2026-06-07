# Claude Design handoff → `@luminova/ui` component migration

**Date:** 2026-06-07
**Status:** approved (brainstorm) → implementing
**Branch base:** `feat/ds-tokens` (B0) off `main`

## Goal

Bring the 28 `@luminova/ui` components up to the latest **Claude Design** spec
(handoff bundle: `library/comp-*.jsx` + `library.css` + `tokens.css`), as **pure
Tailwind v4 utilities**, preserving public APIs so the 44 usage sites (37
backstage + 7 spotlight) absorb the redesign with near-zero churn.

## Decisions (from brainstorm)

1. **Styling approach — translate to Tailwind.** `library.css` is the visual
   source of truth; each component is hand-translated to Tailwind utilities backed
   by `theme.css` tokens. No semantic `jci-*` CSS in the repo (keeps one paradigm,
   matches existing components + `packages/ui/CLAUDE.md`).
2. **Scope — 28 components only.** The bundle's full Spotlight marketing-page
   redesign (`ui_kits/spotlight/`) is a **deferred follow-up** with its own
   brainstorm.
3. **Batching — 7 batches**, each its own commit + PR, reviewed and verified
   in-app before the next.

## Method (per component) — delta-driven

The current components already "mirror the Claude Design handoff's visual spec"
(prior handoff), so many diffs are small.

1. Diff handoff design (`comp-*.jsx` + matching `library.css` block) vs current
   `src/components/*.tsx`.
2. Translate CSS values → token-backed Tailwind utilities. Dimensional one-offs
   stay as arbitrary utilities (`h-[52px]`), matching existing style.
3. **Preserve the public API.** Add new optional props the design introduces;
   never break a prop a usage site uses. A forced value rename → update usage
   sites in the same batch and flag it in the commit body.
4. Repo conventions: raw TS source, `cn()` merge, React peer dep, `motion-reduce:*`
   variants, named export in `src/index.ts` (QR pair stays deep-import only).

## B0 — token reconciliation (`theme.css`)

Brand values stay locked. Add what the handoff has and we lack:
- Brand tints: `jci-blue-75/50/25`, `jci-teal-50`, `jci-navy-50`.
- `ink-4` (rgba(19,15,45,0.32)); on-dark inks `on-dark-1/2/3`.
- Motion easing token `--ease-expo` (out-expo `cubic-bezier(0.16,1,0.3,1)`).
- Brand type scale (`text-display/title/subtitle/quote`) — foundation; mostly
  consumed by the deferred Spotlight work, added now for completeness.

Shared component decisions (control heights 52/42, control radius 10px, focus
ring, shadow set) are applied as arbitrary Tailwind utilities in the components,
not new global tokens — consistent with the current code.

## Batch plan

| Batch | Branch | Components |
|-------|--------|-----------|
| B0 | `feat/ds-tokens` → main | tokens + docs + sync rules |
| B1 | `feat/ds-forms` → B0 | Button, Input, Textarea, Select, Field, Combobox, MultiSelect |
| B2 | `feat/ds-feedback` → B0 | Badge, Skeleton, Toast, Tooltip, EmptyState |
| B3 | `feat/ds-data` → B0 | Table, KpiCard, LineChart, Sparkline |
| B4 | `feat/ds-overlays` → B0 | Dialog, Sheet, Popover |
| B5 | `feat/ds-structure` → B0 | LogoLockup, SectionHeader, ArrowLink, ImgSlot, Reveal, Ripple, Icons |
| B6 | `feat/ds-domain` → B0 | QrCode, QrScanner |

B1–B6 depend only on B0 (new tokens) and are mutually independent → siblings off
`feat/ds-tokens`, PR into it; GitHub retargets to `main` when B0 merges.

## Per-batch loop (the repeatable unit)

TDD where behavior exists → translate components → `react-best-practices` →
update `DESIGN.md`/exports if inventory changed → `pnpm typecheck && lint && test`
→ verify visually in-app → `bundle-budget-watcher` → checkpoint commit (≤10 files)
→ push → open PR.

## Usage sites

APIs preserved → most of the 44 files need no change. A new capability is opt-in.
A forced rename is updated + listed in the batch commit.

## Testing & verification

Keep existing unit tests green (`multi-select`, `combobox`, `sparkline`,
`line-chart`). Add tests only for new logic. Visual check per batch via the
running app (backstage covers most; spotlight covers structure/brand). No auth /
rules / functions touched → security/functions reviewers not required.

## Risks

- Token name clashes in `theme.css` — reconcile, don't duplicate.
- `qrcode.react` / `@zxing` deep-import chunking must stay intact (B6).
- Handoff QR/QrScanner are **visual mocks**; our real libs keep their function —
  we adopt only the visual treatment (framing, padding, scanline).

## Deliverables

1. 28 migrated components + reconciled tokens across 7 PRs.
2. `docs/tooling/claude-design-handoff.md` — repeatable handoff→ingest process.
3. Claude Design sync rules in `packages/ui/CLAUDE.md`.
4. Spotlight page redesign logged as a deferred follow-up.
