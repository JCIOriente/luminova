# Backstage density type scale — audit item 6 (handoff)

**Branch:** `feat/backstage-type-scale` · **Date:** 2026-07-06 · **Audit source:**
`docs/status/2026-07-02-full-audit.md` item 6 ("Backstage density type scale",
Low/confirmed, "DS decision").

## What shipped

A compact fixed-px type scale for `apps/backstage`, replacing 25 distinct
ad-hoc `text-[Npx]` values (247 occurrences across 60 files, including six
half-pixel steps) with **5 named tokens**, plus docs, a preview, and an eslint
guardrail. The decision was the first deliverable (this is a "DS decision" item).

### The scale — `packages/ui/src/theme.css`

Five fixed steps, **named by size not role** (one size legitimately carries
several roles: 13px is body _and_ label _and_ caption — so pick by size, carry
intent with weight + color + tracking). Each ships a default line-height that an
explicit `leading-*` still overrides (Tailwind v4 `--tw-leading`). Distinct
namespace from the fluid brand scale (`text-display/title/subtitle/quote`).

| token         | px | line-height | typical use                                             |
| ------------- | -- | ----------- | ------------------------------------------------------- |
| `text-ui-2xs` | 11 | 1.35        | uppercase eyebrows, tags, badges, kbd, month abbr (600) |
| `text-ui-xs`  | 12 | 1.5         | helper text, secondary meta, timestamps                 |
| `text-ui-sm`  | 13 | 1.5         | **workhorse** — table body, form labels, descriptions   |
| `text-ui-md`  | 14 | 1.45        | emphasized body, nav items, values                      |
| `text-ui-lg`  | 15 | 1.3         | member names, section subheads, small headings (600)    |

Reading tiers (`xs`/`sm`) run 1.5 for wrapping comfort; single-line tiers
(`2xs`/`lg`) run tight so badges/headings don't bloat. **Floor is 11px.**

### Decision provenance

- **frontend-design** → utilitarian-precision direction: tight compact family in
  its own namespace, tuned line-heights.
- **ui-ux-pro-max** → validated: matches the Swiss/dashboard admin pattern
  (weight-driven hierarchy). 11px floor acceptable for non-body micro labels with
  600 + tracking. Line-heights sound (body 1.5, headings tighter). **WCAG note
  (pre-existing, not introduced here):** ink-1 18.5:1 ✓, ink-2 7.5:1 ✓, but
  ink-3 = 3.76:1 and ink-4 = 2.1:1 fall below AA 4.5:1 for normal text. The sweep
  is color-neutral (changed no ink pairings) — recoloring ink-3 is a separate
  token decision. Tracked below.
- **opus token-API review** → the load-bearing calls: **5 steps not 6** (merged a
  redundant 15/16 top pair; a 1px delta is illusory hierarchy — weight/color
  separate better); **size names not role names** (the size→role map is
  many-to-one, so role names lie at the call site); re-ramped line-heights;
  leave ≥18 out.

### Value → step conversion table

| source px | count | → token(s)                              |
| --------- | ----- | --------------------------------------- |
| 10        | 6     | `text-ui-2xs`                           |
| 10.5      | 12    | `text-ui-2xs`                           |
| 11        | 13    | `text-ui-2xs`                           |
| 11.5      | 1     | `text-ui-xs`                            |
| 12        | 49    | `text-ui-xs`                            |
| 12.5      | 13    | `text-ui-xs`                            |
| 13        | 65    | `text-ui-sm`                            |
| 13.5      | 9     | `text-ui-sm` ×7 · `text-ui-md` ×2 (value) |
| 14        | 19    | `text-ui-md`                            |
| 14.5      | 9     | `text-ui-md` ×8 · `text-ui-lg` ×1 (breadcrumb-current) |
| 15        | 21    | `text-ui-lg`                            |
| 16        | 6     | `text-ui-lg`                            |
| 16.5      | 1     | `text-ui-lg`                            |
| 17        | 2     | `text-ui-lg`                            |

All six half-pixel values (10.5, 11.5, 12.5, 13.5, 14.5, 16.5) are eliminated.
Ties broke toward the denser/workhorse step; +1 step only for value/numeral
roles. Total mapped: **226**.

### Consciously unmapped — the ≥18px display baseline (21 occurrences)

Deliberately **outside** the compact scale — a density scale shouldn't own
one-off display type. These stay component-owned literals:

| px | count | where                                                              |
| -- | ----- | ------------------------------------------------------------------ |
| 18 | 2     | activity-card day-of-month numeral · member-drawer name heading    |
| 20 | 2     | initiative-summary progress % · member-credential-card name        |
| 21 | 2     | overview mini-date-badge day · member-points-summary "pts" suffix  |
| 22 | 1     | check-in-stats inline attendance %                                 |
| 24 | 2     | activity-detail-hero h1 · initiative-hero h1                       |
| 26 | 1     | check-in-stats gauge present-count                                 |
| 30 | 1     | page-header h1 (shared PageHeader — already component-owned)       |
| 31 | 6     | auth page h1s (login / forgot ×2 / reset ×3)                       |
| 48 | 2     | member-points-summary rank + activity-count stat numerals          |
| 64 | 1     | member-points-summary hero cumulative-points numeral               |
| 70 | 1     | member-points-summary hero numeral (sm: variant)                   |

KpiCard's 34px value and Dialog's 19px title (component-internal to
`packages/ui`) were **not** touched — the scale decision does not cover them.

### Guardrail — eslint, not a grep script

`eslint.config.js` gains one `no-restricted-syntax` selector appended to the
existing DS-enforcement array (which already bans raw `<input>/<table>` etc):

```
Literal[value=/text-\[(?:[0-9]|1[0-7])(?:\.[0-9]+)?px\]/]
```

Blocks arbitrary sub-18px `text-[Npx]` in `apps/*/src`; ≥18px don't match and
stay allowed. Runs in the existing lint step (no new CI wiring), gives in-editor
feedback, standard `// eslint-disable-*` opt-out. **Chose eslint over a grep
script** (a working grep gate was built first, then replaced): appending to the
existing array reuses one enforcement mechanism, and spotlight has 0 sub-18
arbitrary sizes today so the shared `apps/*/src` glob is effectively a backstage
guard with no false positives. Verified: fires RED on injected sub-18, allows
≥18, no false positives on the swept code or spotlight.

## Verification

- Backstage build green; `text-ui-*` utilities generate in the built CSS with
  the `--tw-leading` override intact.
- Bundle budgets (bundle-budget-watcher): **within budget, net improvement** —
  backstage index JS −2.7 kB gz, index CSS ~flat/favorable (25 arbitrary classes
  collapsed to 5 shared utilities: 12.5 → ~12.2 kB gz). knip clean.
- Sweep mechanical-integrity: **proven pure** — every one of 226 changed lines is
  a `text-[Npx]`→`text-ui-*` token swap matching the conversion table, zero
  collateral edits (211 exact + 15 role-ambiguous verified + 1 prettier reflow).
- Preview `packages/ui/preview/type-density.html` rendered — scale legible at
  admin density, hierarchy holds.
- Gates: **`pnpm pr-tests` green** (format + turbo ci incl. the new eslint rule
  with 0 violations + knip + audit no-HIGH + 20 seed tests). **/simplify** →
  adopted its reuse finding (grep gate → eslint). **/code-review high** → the
  sweep mechanically proven pure; new-logic (eslint regex vs esquery 1.7.0,
  tokens) clean; **1 semantic regression fixed** — the "Próximos eventos" event
  title (14.5px) had tie-broken to `text-ui-lg`, colliding with the card h2;
  re-tie-broken to `text-ui-md`. Security gate not triggered (no
  repositories/auth/rules/functions touched).

**Live-screen visual verify deferred to review:** backstage screens need the
emulator + a seeded login. The change is size-preserving/mechanical and
build-verified; a reviewer with the emulator should eyeball dashboard, members,
activity detail, initiative detail, check-in, and forms.

## Follow-ups (not in this PR — scope discipline)

1. **`packages/ui/src` carries the same sub-18px debt** and renders most
   backstage text (field, data-table, badge, kpi-card, table, dialog, sheet,
   calendar, command-palette, …). Not swept here (item 6 is scoped to the 60
   backstage files; item 5 owns the shared components). The eslint guard doesn't
   cover `packages/ui` because it's also consumed by spotlight's fluid brand
   scale — enforcing there needs a spotlight-safe convention (admin-only
   primitives split, or a component-level allowlist). **Track as a DS-hygiene
   follow-up.**
2. **ink-3 / ink-4 contrast** below WCAG AA for normal text (3.76:1 / 2.1:1 on
   white). Pre-existing, color-neutral to this PR. Separate token decision (also
   affects dark mode + spotlight).
3. **Auth h1 consolidation** — six identical `text-[31px]` page titles across the
   auth forms; a shared `AuthHeading` (or one constant) would DRY them if an
   admin display-heading token ever lands.
4. **eslint regex dormant gaps** — doesn't match `text-[length:13px]` or rem
   forms (`text-[0.8125rem]`); neither is in use today. Documented in the rule
   comment so nobody "fixes" a lint error by switching units.
