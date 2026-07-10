# Impacto unification — one public jargon, one page, one source of truth

Date: 2026-07-10
Branch: `feat/impacto-unification`
App: `apps/spotlight` only. No backend, no schema, no rules changes.

## Problem

The internal Recognition Engine taxonomy (Program / Project / Initiative) leaked into the
public site untranslated. A visitor today sees:

1. **Two nav pages backed by the same data.** `/programas` reads the `showcase`
   collection filtered `featured`; `/impacto` reads it unfiltered. The "Programas" page
   shows no programs — it shows curated *completed* initiatives of any kind. The name
   promises ongoing offerings; the data delivers finished work.
2. **Four competing terms with no anchor.** "programas", "proyectos", "iniciativas",
   "impacto" are used interchangeably across heroes, stats, empty states, and error copy.
   The detail page eyebrow says "El proyecto" even when the item is a Program.
3. **Section jump.** Cards on `/programas` deep-link to `/impacto/$id` — the visitor
   enters one section and lands in another.
4. **False claims.** Home hardcodes "Cinco programas. Un compromiso." over a dynamic
   featured list, and labels a stat "programas insignia activos" over data that only
   contains *completed* items.
5. **`ShowcaseItem.kind` exists but is rendered nowhere** — the one piece of taxonomy
   with public value (annual institutional programs like TOYP) is invisible.

## Decisions (user-confirmed)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Program/Project internal split | **Hidden from public.** Exists for the points engine; public never sees raw taxonomy. |
| D2 | Public IA | **One page.** `/impacto` absorbs `/programas` (redirect). Single nav item. |
| D3 | Umbrella word | **"proyectos"** — layman Spanish, dominant in existing copy. "iniciativas" banned from public copy. |
| D4 | Annual programs (TOYP, Madre Emprendedora, …) | Surfaced as a **"Programa anual" chip** on cards + detail hero, sourced from `kind === "Program"` (user confirmed kind is a reliable proxy: Programs are only created for annual institutional initiatives). |
| D5 | Binary "Programa"/"Proyecto" chip on every card | **Rejected.** Exhaustive labeling of a taxonomy the public can't act on: labels the default, demands a definition the site never gives, competes with the area chip, and "programa" vs "proyecto" are near-synonyms in lay Spanish. Mark the exception ("Programa anual"), never the default. |
| D6 | Series grouping (one TOYP entry with editions) | **Deferred.** Needs a `seriesId` the data model doesn't have. Right long-term identity answer, out of scope. |

### Vocabulary rules (the "one jargon" contract)

- Generic references to the work: **"proyecto(s)"**.
- **"programa(s)"** is allowed *only* when specifically meaning annual institutional
  programs (the chip, prose naming TOYP / Madre Emprendedora / Emprende Oriente,
  the "programas anuales" stat). Never as a generic synonym for proyecto.
- **"iniciativa(s)"** never appears in public copy.
- Code identifiers (`InitiativeKind`, `showcase`, `fetchFeatured`, …) unchanged —
  internal English naming is out of scope.
- `apps/backstage` vocabulary untouched (internal tool; admins know the taxonomy).

### Source of truth

- **Showcase content** (cards, featured band, counts on `/impacto`): the `showcase`
  Firestore collection, one fetch per page (see Data below). No manually maintained copies.
- **Marketing stats on home** (`config.stats.programCount`, countries, years): stay
  president-owned in `siteConfig` — they are curated claims, not derived data. The
  public label changes to match reality: "programas anuales" (countable, truthful,
  on-model). No schema change.

## Information architecture

```
NAV: Inicio · Impacto · Nosotros · Contacto        (Programas item removed)

/impacto
┌────────────────────────────────────────────┐
│ HERO — "Lo que construimos juntos."        │
│ model sentence: proyectos + algunos son    │
│ programas anuales que repetimos cada       │
│ gestión                                    │
│ [N proyectos completados] [M personas]     │
├────────────────────────────────────────────┤
│ ★ Destacados — featured band (curated)     │
├────────────────────────────────────────────┤
│ Todos los proyectos — area filter + grid   │
└────────────────────────────────────────────┘

/programas → redirect → /impacto      (old links + SEO survive)
/impacto/$id — detail; "Programa anual" chip when kind=Program;
               eyebrow "El programa" / "El proyecto" (kind-aware)
```

## Design process (mandatory, per repo memory)

The merged `/impacto` page and the card/chip treatment are **designed on
claude.ai/design first** via the `frontend-design` skill, then implemented through
DesignSync — its "tweaks" are binding. `packages/ui/DESIGN.md` is the token/component
manifest the design must draw from. Design brief inputs: this spec's IA sketch, the
existing showcase card/detail components, JCI palette, the two-tier model (featured
band visually distinct from archive grid; "Programa anual" chip subordinate to the
area chip, never louder).

## Data

- `/impacto`: **one fetch** — `useShowcaseList()` (cached SWR, item 12). Featured band
  derived client-side: `items.filter(i => i.featured)` (featured ⊂ list; a second
  server-side featured query would re-download a subset already in hand).
- Home featured teaser: unchanged — `useFeaturedListOnVisible()` (server-side `where`,
  lazy on scroll). Two caches already exist (`featuredCache`, `showcaseListCache`); no
  data-layer changes.
- `/impacto/$id`: unchanged (`useShowcaseItem`).
- `kind` is already in `ShowcaseItem` and already written by beacon — zero backend work.

## Full sweep map (every site, one jargon)

### Routes / structure

| Site | Today | Change |
|------|-------|--------|
| `routes/programas.index.tsx` | full page | replace with redirect stub → `/impacto` (`beforeLoad` + `redirect`) |
| `routes/impacto.index.tsx` | archive only | add featured "Destacados" band above the filtered grid; hero model sentence; stat label "iniciativas completadas" → "proyectos completados" |
| `routes/impacto.$id.tsx:86` | eyebrow "El proyecto" | kind-aware: "El programa" / "El proyecto" |
| `routes/impacto.$id.tsx` DetailHero | area chip only | + "Programa anual" chip when `kind === "Program"` |
| `routes/impacto.$id.tsx:118` | "Ver todos los proyectos" | keep (already on-jargon) |
| `components/header.tsx:88–99, 145–149` | Programas + Impacto nav items | remove Programas (desktop + mobile) |
| `components/header.tsx:8` | `DARK_HERO_ROUTES` includes `/programas` | drop entry |
| `components/footer.tsx:71–72` | quick link "Programas" → `/programas` | "Impacto" → `/impacto` |

### Components

| Site | Today | Change |
|------|-------|--------|
| `components/showcase/showcase-card.tsx` | area label, no kind | + "Programa anual" chip when `kind === "Program"` (shared by home teaser, featured band, grid) |
| `components/showcase/showcase-grid.tsx:19` | "los proyectos que vamos completando" | keep |
| `components/programs-skeleton.tsx:5` | aria "Cargando programas" | "Cargando proyectos" |
| `components/home-programs.tsx` | section renders featured teaser | cards inherit chip via shared card; filename and internal identifiers stay (not user-visible; renames would churn the lazy-import + skeleton pair for zero public gain) |

### Home (`routes/index.tsx`)

| Line | Today | Change |
|------|-------|--------|
| 102, 193 | `scrollToId("programas")` / `id="programas"` | `"proyectos"` |
| 105 | "Ver nuestros programas" | "Ver nuestros proyectos" |
| 118 | stat label "programas insignia activos" | "programas anuales" (value stays `config.stats.programCount`, president-owned) |
| 204 | eyebrow "Programas insignia", title "Cinco programas. Un compromiso." | eyebrow "Proyectos destacados", count-safe title (final copy from design phase) |
| 207–213 | ArrowLink "Ver nuestro impacto" → `/impacto` | keep |
| 32 | AREAS desc "Proyectos sostenidos…" | keep (on-jargon) |

### Static copy

| Site | Today | Change |
|------|-------|--------|
| `routes/contact.tsx:292` | "cubriendo nuestros programas" | "cubriendo nuestros proyectos" |
| `routes/terminos.tsx:26` | "sus programas e impacto" | "sus proyectos e impacto" |
| `routes/about.tsx:150` | "detrás de cada programa" | "detrás de cada proyecto" |
| `routes/about.tsx:96` | "qué proyectos tomamos" | keep |

### siteConfig defaults (`site-config/defaults.ts`)

| Line | Today | Change |
|------|-------|--------|
| 71 | reasons: "programas estructurados con cohortes…" | "proyectos estructurados…" |
| 30 | timeline "Expansión de programas" (names Madre Emprendedora, Emprende Oriente) | **keep** — legitimately refers to annual programs (allowed by vocabulary rule) |
| 51 | "proyectos vigentes en cinco frentes" | keep |

**Ops note:** `defaults.ts` only seeds; the live `siteConfig/current` Firestore doc may
carry old copy. After merge, the president (or an admin via backstage `/config`) must
update the live `reasons` text to match. One-line item in the PR test plan.

### Unified state copy (all showcase surfaces)

- Loading aria: "Cargando proyectos"
- Error: "No pudimos cargar los proyectos en este momento. Vuelve a intentarlo más tarde."
- Empty archive: "Pronto compartiremos aquí nuestros proyectos ejecutados."
- Empty featured band: band hidden (no empty state — archive below carries the page)

## Not doing (explicit)

- No kind chip on Projects (D5), no binary taxonomy UI.
- No `seriesId` / edition grouping (D6 — deferred, documented).
- No backstage renames, no `@luminova/types` changes, no beacon/rules/schema changes.
- No pagination on the archive (collection is small; revisit at ~50 items).
- No change to `fetchFeatured` home path or the item-12 cache layer.

## Tests

- Redirect: `/programas` → `/impacto` (route-level test, mirrors `enlaces.test.tsx` style).
- Chip: card renders "Programa anual" for `kind: "Program"`, nothing for `"Project"`
  (extend `showcase-grid.test.tsx` fixtures).
- Featured band derivation: featured items appear in band AND in archive grid; band
  hidden when no featured items.
- Detail eyebrow kind-awareness.
- Existing suites must stay green: `pnpm --filter spotlight run ci`.

## Performance

- `/programas` route chunk deleted → small bundle win.
- `/impacto` goes from one fetch to one fetch (featured derived, not re-fetched).
- Dispatch `bundle-budget-watcher` after the route change; budgets in
  `docs/performance.md` (initial JS ≤ 100 kB gz, route chunk ≤ 40 kB gz).

## Docs to update in the PR

- `apps/spotlight/CLAUDE.md` routes table (already stale — add `/impacto`, `/impacto/$id`,
  redirect note, drop `/programas` as a page).
- `docs/features.md` public showcase section if it names `/programas`.
