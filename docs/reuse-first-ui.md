# Reuse-First Contribution Guide — Luminova UI

Grounded in the repo as of 2026-07 (`main`). Sources of truth:
`packages/ui/src/theme.css` (tokens), `packages/ui/src/index.ts` (barrel),
`packages/ui/DESIGN.md` (manifest), root `eslint.config.js` (guards).

**Why this exists.** Two recurring drift vectors this guide fights: (1) a
component gets built a second time because nobody knew the first existed
(photo hooks, cached-async hooks, datetime, and 404 chrome all shipped twice
before being deduped); (2) a color gets typed as a raw hex literal instead of
a token, silently breaking dark mode. Reach for this before you style or build.

---

## 1. TL;DR — the rule

Before you style or build **anything**:

1. **No raw hex / rgba in `className`.** Every color already has a token in
   `packages/ui/src/theme.css`. Use the utility it generates (`bg-surface-2`,
   `text-ink-2`, `border-line`, `text-jci-blue`) — never `text-[#0097d7]`,
   never `bg-[rgba(…)]`. An eslint rule now errors on these (section 6).
2. **Check the catalog before building.** The shared `@luminova/ui` library
   already covers tables, modals, badges, empty/error states, date pickers,
   avatars, charts, and more (section 4). An eslint rule already errors on raw
   `<input>`, `<textarea>`, `<select>`, `<table>` in app code.

If a token or component is genuinely missing, follow the checklist in
section 5 before adding one.

---

## 2. Color tokens (29)

Defined in `packages/ui/src/theme.css` inside a Tailwind v4 `@theme` block as
`--color-*` variables, which auto-generate utilities: `text-jci-blue`,
`bg-surface-2`, `border-line-strong`, `text-ink-3`, etc.

### Brand — LOCKED (8)

Never adjust these values. Off-brand proposals get flagged, not applied.

| Token | Value | Use for |
|---|---|---|
| `jci-blue` | `#0097d7` | Primary brand / CTAs / links / focus rings |
| `jci-blue-2` | `#0086c0` | Hover/darker step of jci-blue |
| `jci-black` | `#130f2d` | Brand dark surfaces (heroes, footers, 404 stage) |
| `jci-white` | `#ffffff` | Text/marks on dark or blue surfaces |
| `jci-navy` | `#1f4789` | Secondary brand accent |
| `jci-teal` | `#57bcbc` | Tertiary brand accent |
| `jci-yellow` | `#efc40f` | Highlight accent (sparing) |
| `bone` | `#f4f1ea` | Warm off-white marketing surface |

### Sanctioned brand tints (5)

The only approved lightened brand steps (25/50/75% over white). Do not invent
new tints with opacity utilities when one of these fits.

| Token | Value |
|---|---|
| `jci-blue-75` | `#40b1e1` |
| `jci-blue-50` | `#80cbeb` |
| `jci-blue-25` | `#bfe5f5` |
| `jci-teal-50` | `#abdddd` |
| `jci-navy-50` | `#8fa3c4` |

### Neutrals — surfaces / lines / ink (9)

These are the tokens dark mode remaps — using them (instead of literals) is
what makes a screen dark-mode-correct for free.

| Token | Light value | Use for | Dark (`[data-theme="dark"]`) |
|---|---|---|---|
| `surface` | `#ffffff` | Page / card background | `#16132b` |
| `surface-2` | `#f7f9fb` | Recessed panels, table headers | `#1d1936` |
| `surface-3` | `#eef2f6` | Deepest inset (wells, hover fills) | `#262141` |
| `line` | `rgba(19,15,45,.08)` | Default borders / dividers | `rgba(255,255,255,.1)` |
| `line-strong` | `rgba(19,15,45,.16)` | Emphasized / input borders | `rgba(255,255,255,.18)` |
| `ink-1` | `#130f2d` | Primary text | `#f4f2fb` |
| `ink-2` | `rgba(19,15,45,.72)` | Body / secondary text | `rgba(244,242,251,.74)` |
| `ink-3` | `rgba(19,15,45,.52)` | Muted meta (known AA gap ~3.76:1, tracked) | `rgba(244,242,251,.54)` |
| `ink-4` | `rgba(19,15,45,.32)` | Faintest hints / disabled | `rgba(244,242,251,.34)` |

Dark mode is backstage opt-in via `data-theme="dark"`; it overrides **neutrals
only** — brand colors stay locked. A hardcoded literal breaks dark mode
silently.

### On-dark inks (3)

Text on `jci-black` / `jci-blue` surfaces. Use these instead of `text-white/xx`
opacity improvisation.

| Token | Value | Use for |
|---|---|---|
| `on-dark-1` | `#ffffff` | Primary text on dark |
| `on-dark-2` | `rgba(255,255,255,.85)` | Secondary text on dark |
| `on-dark-3` | `rgba(255,255,255,.55)` | Muted text on dark |

### Semantic status (4)

Validation / state colors — not brand palette. Never use `jci-yellow` for a
warning or `jci-teal` for success.

| Token | Value | Use for |
|---|---|---|
| `ok` | `#1f8a5b` | Success text/chips |
| `error` | `#c0392b` | Errors, destructive, validation |
| `warn` | `#8e7300` | Warnings |
| `teal-ink` | `#2e8c8c` | Readable teal for text (brand `jci-teal` fails contrast as text) |

### Non-color tokens

| Group | Tokens |
|---|---|
| Fonts | `font-sans` (Plus Jakarta Sans), `font-serif` (Arvo), `font-mono` (JetBrains Mono) |
| Radii | `rounded-card` (12px), `rounded-pill` (9999px) |
| Easing | `ease-expo` |
| Animations | `animate-ripple-spin`, `animate-toast-in`, `animate-qr-scan`, `animate-skeleton`, `animate-rise`, `animate-overlay-in/out`, `animate-sheet-in/out`, `animate-menu-in/out`, `animate-dialog-in/out` — keyframes live in `theme.css`; animated components must pair with `motion-reduce:animate-none` |

### The raw-hex ban, and its one exception

**Ban (enforced — section 6):** no hex/rgb(a) inside a Tailwind arbitrary-value
color utility in `className` — `text-[#…]`, `bg-[rgba(…)]`, `border-[#…]`,
`from-[#…]`. If the color you want isn't a token, it's either one of the tokens
above in disguise, or a conversation about adding one to `theme.css`.

**The one legitimate exception — inline `style`, where a token utility can't
reach.** A few CSS features can't consume a `var()`/utility: a color stop
inside a background gradient, an SVG `fill`/`stroke` attribute. There a literal
is unavoidable. The rules of the exception:

1. The literal must be a **documented derivation of a brand token** (comment
   which token + which alpha, e.g. `jci-teal at 85%`).
2. It is **centralized once in a shared component**, never duplicated per app.
3. It goes through an inline `style={{ … }}`, keeping the escape hatch
   greppable.

That's why the hex guard targets `className` arbitrary values only, not `style`
objects. Spotlight's marketing CSS (`apps/spotlight/src/styles.css`) is the
other sanctioned home for gradients / `color-mix()` — but there it uses the
aliased `var(--jci-…)`, not raw hex.

---

## 3. Type scale + Tailwind conventions

Two scales, both in `theme.css`. Pick by surface:

### Brand scale (fluid, marketing / heroes)

| Utility | Value | Use |
|---|---|---|
| `text-display` | `clamp(40px, 6.8vw, 72px)` | Hero statements |
| `text-title` | `clamp(32px, 4.4vw, 48px)` | Page / section titles |
| `text-subtitle` | `clamp(20px, 1.7vw, 24px)` | Standfirsts, lead-ins |
| `text-quote` | `clamp(22px, 2.6vw, 32px)` | Pull quotes |

### Compact admin scale (fixed px, backstage density)

Named **by size, not role** — 13px is body *and* label *and* caption; carry
intent with weight + color + tracking. Bundled line-heights are defaults; an
explicit `leading-*` still overrides. **Floor is 11px — never smaller.**

| Utility | Size / LH | Typical use |
|---|---|---|
| `text-ui-2xs` | 11 / 1.35 | Uppercase eyebrows, tags, badges, kbd |
| `text-ui-xs` | 12 / 1.5 | Helper text, secondary meta, timestamps |
| `text-ui-sm` | 13 / 1.5 | **Workhorse** — table body, form labels, descriptions |
| `text-ui-md` | 14 / 1.45 | Emphasized body, nav items, values |
| `text-ui-lg` | 15 / 1.3 | Names, section subheads, small headings |

### When is arbitrary `text-[Npx]` allowed?

Only for **N ≥ 18** — component-owned display literals (page/hero titles, KPI
stat numerals, date-chip day numbers). Anything below 18px must be a
`text-ui-*` step. Enforced in root `eslint.config.js` (`no-restricted-syntax`,
scope `apps/*/src/**/*.tsx`, tests excluded; `packages/ui` is exempt — it owns
the primitives). Migration map: `<=11 → 2xs`, `12 → xs`, `13 → sm`, `14 → md`,
`15/16/17 → lg`.

### Other Tailwind conventions

- **Pure Tailwind v4 utilities** in shared components — no semantic CSS classes
  in `packages/ui`. Semantic classes (`.area-card`, `.site-header`) are
  spotlight-local marketing styling only.
- Use `cn()` from `@luminova/ui` to merge/override classes (tailwind-merge —
  order matters, append overrides last).
- Apps consuming `@luminova/ui` **must** keep the
  `@source "../../../packages/ui/src/**/*.{ts,tsx}"` line in their entry CSS or
  the library's utilities get purged and components render unstyled.
- Reduced motion: use `motion-reduce:*` variants on anything animated.

---

## 4. Component quick-index (@luminova/ui)

Barrel: `packages/ui/src/index.ts` — explicit named exports, no `export *`.
Full manifest with props/variants: `packages/ui/DESIGN.md`. Import
`import { Button, DataTable } from "@luminova/ui"`.

> The **barrel is the canonical list** (`DESIGN.md` mirrors it for design-tool
> ingest). The table below is not a third registry to keep in sync — it exists
> only to carry the "reach for X, don't build Y" guidance. If a name here
> disagrees with the barrel, the barrel wins; fix this table when you notice.

### Form controls

| Component | Use it for | Don't build instead |
|---|---|---|
| `Button` | Pill CTA; variants primary/secondary/ghost, `onDark`/`onBlue`, `sm`; polymorphic `a`/`button` | Any styled CTA. (Raw `<button>` IS allowed for icon/nav/tab buttons — Button is deliberately only the pill CTA) |
| `IconButton` | Icon-only button, variants subtle/ghost/danger, sm/md, required `aria-label`; `a` or `button` | Hand-rolled square / row-action icon buttons |
| `Input` | Text input (also exports `fieldControlClasses` for custom hosts) | Raw `<input>` — eslint errors on it |
| `SearchInput` | Search box with leading icon; sr-only `label` required; `size` md/sm | Input + absolute-positioned icon combos |
| `Textarea` | Multi-line input | Raw `<textarea>` — eslint errors |
| `Select` | Native styled select | Raw `<select>` — eslint errors |
| `Field` | Label + error wrapper around any control | Per-form label/error markup |
| `Checkbox` | Label + branded box | Raw checkbox styling |
| `Combobox` | Single-select with search (`ComboboxOption`) | Autocomplete dropdowns |
| `MultiSelect` | Multi-select with chips | Tag pickers |
| `DatePicker` | Calendar popover, `yyyy-MM-dd`, month/year dropdown caption | Any date input |
| `DateTimePicker` | Calendar + time, `yyyy-MM-ddTHH:mm` | Datetime inputs |
| `SegmentedControl` | Single-select pill toggle group (period/view filters); controlled `value`+`onChange` | Button-group filters. For route-changing tabs use links, not this |
| `ImageUploader` | Upload + crop (lazy `react-easy-crop`) + compress; `aspect`, `cropShape` round/rect, `maxEdge` | Any avatar/logo/photo upload flow |

### Layout / surface / brand

| Component | Use it for | Don't build instead |
|---|---|---|
| `Card` | THE card shell: `as`, `padding` md/sm/row/none, `interactive`; plus `cardSurfaceClasses`/`cardInteractiveClasses` strings for `button`/`Link` hosts | `rounded-card border border-line bg-surface …` by hand (the 40-site sweep already removed those) |
| `SectionHeader` | Section title + standfirst block | Ad-hoc heading stacks |
| `ArrowLink` | Text link with arrow affordance | Custom "see more →" links |
| `LogoLockup` | JCI logo rendering (PNG assets in `packages/ui/src/assets/`) | Re-importing logo files per app |
| `ImgSlot` | Image placeholder frame | Gray-box placeholders |
| `Icon` + `ArrowRight` | The icon set (`Icon.bell({ s: 20 })` style) | Importing one-off icon libs for existing glyphs |
| `Reveal` | Scroll-in animation (IntersectionObserver) | Per-page observer hooks |
| `RippleSVG` / `RippleBackground` / `RippleDivider` | Brand ripple motif (hero backgrounds, dividers) | Redrawing the ripple |

### Feedback / status

| Component | Use it for | Don't build instead |
|---|---|---|
| `Badge` | Status/category chips (`BadgeTone` tones) | Hand-rolled pills |
| `Skeleton` | Loading shimmer | Custom pulse divs |
| `Toast` | Transient confirmation (presentational) | Notification popups |
| `Tooltip` | Radix tooltip, token-styled | `title=` hacks or CSS tooltips |
| `EmptyState` | "Nothing here" panels, optional `action` slot | Per-feature empty divs |
| `ErrorState` | Query/load failure panel; composes EmptyState, optional `onRetry` (omit retry for permission-denied) | Per-route error markup |

### Data display

| Component | Use it for | Don't build instead |
|---|---|---|
| `Table` + `TableHeader/Body/Row/Head/Cell` | Static/simple tables | Raw `<table>` — eslint errors |
| `DataTable` | Client search / sort / filter-chips / skeleton / empty (`DataTableColumn`, `FilterChip`); composes Table | Any admin list view |
| `KpiCard` | Stat card with `KpiTone` + `KpiTrend`, optional icon | Dashboard stat boxes |
| `ProgressBar` | 0–100 clamped bar, ARIA progressbar | Custom width-percentage divs |
| `Avatar` | Person image w/ `initials()` fallback | Rounded img + fallback logic |
| `AvatarStack` | Overlapping people row, `max` + "+N" overflow chip | Team avatar rows |

### Overlays

| Component | Use it for | Don't build instead |
|---|---|---|
| `Dialog` | Centered modal; `hideHeader` for self-chromed modals, `overlayClassName`/`contentClassName` | Any modal — includes focus trap (wrap Dialog, don't hand-roll) |
| `Sheet` | Right slide-over; `size sm\|md\|lg\|xl` (440/560/680/800) | Drawer panels |
| `Popover` | Radix popover (backs Combobox/MultiSelect) | Floating panels |
| `Menu` / `MenuItem` / `MenuSeparator` | Row "⋯" action menus, keyboard nav (Radix DropdownMenu) | Dropdown action lists |
| `CommandPalette` | ⌘K palette (`CommandItem`, cmdk, fuzzy filter) | Search-everything UIs |

### Charts

| Component | Use it for |
|---|---|
| `LineChart` | Line chart (`ChartSeries`; data logic in `line-chart.ts`) |
| `Sparkline` | Inline trend line |

### Deep-import only — NOT in the barrel

| Component | Import path | Why |
|---|---|---|
| `QrCode` | `@luminova/ui/qr-code` | Pulls `qrcode.react` — must stay in a lazy chunk |
| `QrScanner` | `@luminova/ui/qr-scanner` | Pulls `@zxing` — must stay in a lazy chunk |

Never re-export these from the barrel and always load them behind `React.lazy` —
they exist outside `index.ts` precisely to keep heavy deps out of the static
graph (backstage index budget).

### Utilities

`cn()` (class merge, `lib/cn.ts`) and `initials()` (`lib/initials.ts`).

---

## 5. Decision checklist — before you add anything new

1. **Search the barrel.** Open `packages/ui/src/index.ts` and scan `DESIGN.md`.
2. **Search adjacent feature files.** Backstage patterns repeat; the thing you
   need is often two folders away (photo hooks, cached-async hooks, datetime,
   404 chrome — all got deduped after being built twice).
3. **Color needed? Check the token table (section 2) first.** If it's "brand
   blue but lighter", one of the sanctioned tints is your answer. If it's
   genuinely new, propose a token in `theme.css` — never a literal.
4. **Component needed? Check whether an existing component + prop covers it.**
   Sheet takes a `size`; Card takes `padding`/`interactive`/`as`; Dialog takes
   `hideHeader`; Button takes `onDark`. Prefer adding an **optional prop** to a
   shared component over forking it — public APIs stay stable so the ~44 usage
   sites absorb changes with no churn.
5. **Complex a11y widget? Go shadcn/Radix**, from `packages/ui`:
   `pnpm dlx shadcn@latest add <component>` — then wrap the primitive with our
   token utilities (the Tooltip/Popover/Dialog pattern). Never adopt shadcn's
   separate theme-var system.
6. **Only then build.** And when you do:
   - Register the export in `packages/ui/src/index.ts` (explicit named export,
     no `export *`) — unless it pulls a heavy dep, then give it a deep-import
     subpath like the QR pair.
   - Add it to `DESIGN.md` (component table + bump the count in the
     `Components (N — shipped)` heading) and the inventory in
     `packages/ui/CLAUDE.md`. Keep the counts in sync — they have drifted
     before (section 7).
   - Make sure the export is **consumed** by an app or the smoke test — knip
     flags unused exports and the ui-package rule requires every export to have
     a consumer.
   - English identifiers, Spanish only in user-facing labels/values. No barrel
     files inside app features — deep-import feature files directly.
   - New dependency? `secure-dep-vetting` first, always.

---

## 6. How this is enforced

| Guard | Mechanism | What it catches |
|---|---|---|
| Raw-element ban | `eslint.config.js` `no-restricted-syntax` (scope `apps/*/src/**/*.tsx`) | Raw `<input>`, `<textarea>`, `<select>`, `<table>` → "Use `<X>` from @luminova/ui". Raw `<button>` intentionally allowed |
| **Raw-hex ban** | Same rule block — selector on `-[#…]` / `-[rgb(…)]` / `-[rgba(…)]` in a string literal | Arbitrary color utility in `className` → "use a `theme.css` token". Inline `style` literals (the `var()`-can't-reach exception) are not matched |
| Sub-18px type ban | Same rule block, regex `text-\[(?:[0-9]\|1[0-7])(?:\.[0-9]+)?px\]` | Any arbitrary `text-[Npx]` with N<18 → use `text-ui-*` |
| Errors actually block | All three are `"error"` — `pnpm lint` is a bare `eslint .` (exits 0 on warnings), so only `error` gates CI (`checks` job) |
| Unused exports | `pnpm knip` | A component exported from `index.ts` but consumed nowhere |
| Component registry | Manual convention (ui `CLAUDE.md`: update `DESIGN.md` when a component is added/removed) | **Not mechanical — and it has drifted** (section 7). Treat "barrel change ⇒ DESIGN.md change" as part of the diff |
| Bundle discipline | `bundle-budget-watcher` agent + `check-bundle-budget.sh` in CI `checks` | New dep/route blowing the gz index budget (why QR is deep-import) |
| Review gates | `react-best-practices` (auto on `.tsx`), `/code-review`, `/security-review` where triggers match | Everything else |

### The raw-hex guard's known gaps

The guard is deliberately narrow (favouring zero false-positives over total
coverage). Two things it does **not** catch — still a color literal, still to
be avoided, just not yet mechanically blocked:

1. **Template literals.** A hex inside `` cn(`text-[#fff]`) `` is a
   `TemplateElement`, not a `Literal`, so it slips through — the same gap the
   sub-18px type guard has. Rare for static class strings; review covers it.
2. **A color buried mid-value in a multi-value arbitrary utility** — chiefly
   `shadow-[0_8px_24px_-12px_rgba(19,15,45,.45)]` and
   `bg-[linear-gradient(…,#fff)]`. The selector anchors the color at `-[` to
   avoid matching structural arbitraries, so a literal that appears after other
   tokens inside the brackets isn't seen. A handful of elevation shadows in
   backstage use this form today. Broadening the selector would flag them, but
   they have no shadow-color token to migrate to yet — that's the follow-up
   below, not this guard.

### Proposed (TODO — not yet wired)

- **Shadow-color tokens + broadened hex guard**: add elevation/shadow color
  tokens to `theme.css`, migrate the existing `shadow-[…rgba(…)]` literals
  (backstage: activity-card, scan-modal, member-points-summary), then widen the
  selector to `-\[[^\]]*(?:#[0-9a-fA-F]{3,8}|rgba?\()` so buried color literals
  are caught too (re-run the false-positive grep for `content-[`/`url(#`/`mask-[`
  first).
- **DESIGN.md count gate**: a script diffing barrel exports vs `DESIGN.md` rows
  (and the `(N — shipped)` heading) would catch the drift in section 7
  mechanically.

---

## 7. Known drift (as of this writing) — fix when touched

The manifest/inventory counts and rows are hand-maintained and have drifted;
listed here so a reader trusts **the barrel (`index.ts`) as the source of
truth** over the manifest until reconciled. Fix the counts as part of the next
change that touches the component set, not as an isolated churn commit.

1. **Component counts disagree**: `DESIGN.md` heading says
   "Components (37 — shipped)" and `packages/ui/CLAUDE.md` says "38 components",
   while the barrel exposes more component families than either number.
2. **Three barrel components are missing from `DESIGN.md`'s tables**:
   `IconButton`, `SegmentedControl`, `ImageUploader` (all exported in
   `index.ts` and in use). `DESIGN.md` is the Claude Design ingest manifest, so
   these are invisible to design-system sync until added.
3. **`DESIGN.md` motion row omits `qr-scan`** (`--animate-qr-scan` exists in
   `theme.css`).
4. **Spotlight alias block duplicates literals**: `apps/spotlight/src/styles.css`
   aliases brand tokens correctly (`--jci-blue: var(--color-jci-blue)`) but
   hardcodes the neutral values (`--surface: #ffffff`, `--ink-1: #130f2d`, …)
   instead of aliasing `var(--color-surface)` etc. — a latent drift risk if
   `theme.css` neutrals change (spotlight has no dark mode, so latent not live).
