# DS adoption track — audit item 5 (2026-07-03)

Closes audit item 5 from `2026-07-02-full-audit.md` as five stacked PRs, each
independently green. **Merge in order:** #131 → #132 → #133 → #134 → #135.

| PR | Branch | What |
|----|--------|------|
| #131 | `feat/ui-card-primitive` | `Card` primitive (as / padding md-sm-row-none / interactive + `cardSurfaceClasses`/`cardInteractiveClasses`) and the ~40-site backstage sweep; 3-radii drift (12/14/16px) unified to `rounded-card`; KpiCard + overview + DataTable aligned; perf baselines refreshed (spotlight 94 / backstage 99.7 kB gz) |
| #132 | `feat/ui-search-input` | `SearchInput` (sr-only label via useId, caller id wins, type pinned post-spread, WebKit clear suppressed, md/sm); DataTable composes it; members + initiative-filters adopt; ⌘K topbar trigger deliberately excluded (button, not input) |
| #133 | `feat/ds-adopt-primitives` | MemberStatusFilter → `SegmentedControl` (counts in option labels); check-in pills → `Badge`; `KpiCard.icon` optional + InitiativeStatCard deleted; raw text button → `Button variant=link` |
| #134 | `feat/scan-modal-dialog` | ScanModal onto Radix-backed `Dialog` — real focus trap (the audit's a11y gap); Dialog gains `hideHeader`/`overlayClassName`/`contentClassName` (defaults byte-identical for the 7 consumers); focus trap proven by integration tests |
| #135 | `feat/ripple-token-colors` | Ripple brand hexes → tokens at ~15 call sites; RippleDivider default → `line-strong`; SVG `fill` moved to style (var() invalid in SVG attributes) |

## Conscious decisions (don't re-litigate)

- **Resting shadow** `0 1px 2px rgba(19,15,45,0.05)` is part of `cardSurfaceClasses` unconditionally — the shadowless section cards were the drift, not the intent. Escape hatch: `className="shadow-none"` (used on inset `bg-surface-2` panels + nested table wrappers inside forms/sheets).
- **12px radius won.** 14px (KpiCard) and 16px (overview) were the outliers vs the `--radius-card` token + the whole overlay family.
- **No `tone="muted"` Card prop** — `className="bg-surface-2"` via cn-merge-last is the documented escape (3 sites, 3 paddings kept).
- **Not migrated, on purpose:** bg-jci-white QR frames (dark-mode scannability), bg-jci-blue action tile, floating date chip, overview month/day tile (calendar glyph ≠ KPI), activity-team mono eyebrow chip, member-filter removable Chip, spotlight `.showcase-pill` (app-local CSS by convention), ⌘K trigger.
- **Scan modal dismissal stays fully open** (Escape + outside-click): a hung write must never trap the camera.

## Verification

Per PR: TDD RED-first component tests, /simplify (4 angles), /code-review high
(up to 8 finder angles + verify), pnpm pr-tests green, visual pass on
emulator-seeded dev (dashboard, members, activities, initiative Resumen,
check-in, scan modal, spotlight hero). bundle-budget-watcher: spotlight 93.96 /
backstage 99.68 kB gz — within budget (+1.38 kB from Card, 15.3 kB headroom),
knip clean. Design previews (`components-card-shell.html`,
`components-search-input.html`) synced to the JCI Oriente claude.ai/design
project.

## Review catches worth remembering

- /code-review caught 2 real a11y regressions: `as="section"` dropped where
  `aria-labelledby` needs a region landmark (sweep-agent instruction gap).
- The overview quick-action tile's hand-rolled hover was missing
  focus-visible + reduced-motion — adopting `cardInteractiveClasses` fixed it.
- Three audit sub-rows were already stale (ink-4 doc drift, Ripple defaults,
  TONE_RIPPLE_COLOR) — fixed by #124 previously.

## After merge

- `git worktree remove` for: ui-card, ui-search, ds-adopt, scan-dialog,
  ripple-tokens.
- Owner op: none. Next track: audit item 6 (backstage density type scale — a
  pending DS decision) or item 7 (programs/projects merge).
