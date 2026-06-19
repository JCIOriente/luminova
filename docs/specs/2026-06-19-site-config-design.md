# Site Config — president-editable spotlight content

**Date:** 2026-06-19
**Branch:** `feat/site-config`
**Status:** Design approved (brainstorming) → pending implementation plan

## Problem

`apps/spotlight` hard-codes ~20 facts inside route/component files: numeric stats
(+32 años, 5 programas, 100+ países, 200.000+ miembros, +11 reconocimientos, 100%
eficiencia, 2021 standout-org award), org lists (aliados, hitos/timeline, roles del
comité, MVV, tres razones) and contact/org info (email, ubicación, horario de reunión,
enlaces). A chapter president — who serves a **one-year term** — cannot change any of
this without a developer + redeploy.

Goal: make this content editable from `backstage`, served to `spotlight` as fast as
possible, with near-instant propagation when edited.

## Scope

**Editable (in site-config):**
- Stats (1–7): yearsActive*, programCount, countries, membersWorldwide, nationalAwards,
  efficiencyPct, standoutOrg {year, title}
- Lists (12–17, except programs): allies, timeline, execRoles, MVV, reasons
- Contact/org (18–21): email, location, meetingSchedule, links

**NOT editable — stays in code:**
- Dates/facts (8–11): founding years 1915/1946/1993, age range 18–40 (set-once,
  rarely change)
- Flagship program cards (12): **reuse the existing `featured` showcase items**
  already in Firestore; render via a **lazy-loaded** home component so it does not
  block initial page load. No duplicate data entry.

\* `yearsActive` is **computed** client-side (`currentYear − 1993`), NOT stored —
otherwise it goes stale every January. The timeline "Hoy" milestone is likewise
rendered dynamically.

## Architecture

### Data model — Firestore singleton `siteConfig/current`

```
siteConfig/current {
  version: number           // bumped on every save → SWR cache buster
  updatedAt: timestamp
  stats: {
    programCount: number
    countries: string        // "100+"
    membersWorldwide: string // "200.000+"
    nationalAwards: number
    efficiencyPct: number
    standoutOrg: { year: number, title: string }
  }
  allies: string[]
  timeline: { year: string, title: string, description: string }[]
  execRoles: string[]
  mvv: { mision: string, vision: string, valores: string }
  reasons: { number: string, title: string, body: string }[]
  contact: { email: string, location: string, meetingSchedule: string,
             links: { label: string, url: string }[] }
}
```

- One doc → one read, one snapshot, atomic save.
- Unlike `showcase` (beacon-projected), this is **hand-authored** → `backstage`
  writes it **directly**. No beacon involvement.
- Schema lives in `@luminova/types` (shared by backstage form + spotlight reader);
  Zod schema mirrors it. Codegen-drift gate applies (shared contract).
- `firestore.rules`: `match /siteConfig/{doc} { allow read: if true; allow write:
  if isAdmin(); }` — public read, admin-only write.

### Backstage — `/config` ("Configuración del sitio")

- **Singleton page**, not a CRUD list (exactly one doc).
- `siteConfigRepository` (get + update) — existing repository pattern.
- `useSiteConfig` query + `useUpdateSiteConfig` mutation (TanStack Query v5).
- React Hook Form + Zod, one schema. Sectioned/collapsible cards:
  Stats · Aliados · Hitos · Comité · MVV · Razones · Contacto.
  `useFieldArray` for the list sections (allies, timeline, reasons, execRoles, links).
- Save = `setDoc(merge)` writing fields **+ bump `version`** + `updatedAt` server
  timestamp, in one atomic write.
- Scaffold via `backstage-feature-scaffold`, adapted to singleton (drop list view).

### Spotlight — read + cache (stale-while-revalidate)

Chosen: **SWR + localStorage persistence** (`persistQueryClient`).

- `createSyncStoragePersister` → `localStorage`.
- `buster: String(version)` — old cache discarded when the doc's `version` changes,
  so a bumped version is never served stale.
- `maxAge`: 30 days; `gcTime` ≥ `maxAge`. (Staleness is irrelevant — we always
  revalidate on mount; `maxAge` only governs whether a localStorage copy is kept.)
- `staleTime`: ~1h → every realistic visit triggers a background refetch.
- **Selective persistence** (`dehydrateOptions`): only the `siteConfig` query is
  persisted; photo-heavy `showcase` queries stay in-memory.
- Reader uses `firebase/firestore/lite` (matches existing `showcase-firestore.ts`).

Behavior: repeat visits paint instantly from localStorage (zero network wait), a
background read swaps in fresh data if changed. First-ever visit = one cheap singleton
read (well within free tier).

### Refresh / propagation

No cron, no manual push button, no beacon trigger.
- President saves → doc updates, `version` bumps.
- Next visitor paints stale-for-one-frame, background read returns new doc, UI swaps
  (~one page load). Bumped `version` = `buster` → every browser discards its old
  localStorage copy on next load. That **is** the "hard purge everywhere" lever.
- The user's "6-month refresh policy" is unnecessary: SWR makes timed TTL refresh
  obsolete; freshness comes from revalidation, not expiry.

## Implementation order

1. `@luminova/types` — `SiteConfig` type + Zod schema (+ codegen-drift gate).
2. `firestore.rules` — `siteConfig` public-read / admin-write + rules tests.
3. `backstage` — repository, hooks, `/config` route + sectioned form.
4. `spotlight` — reader (firestore-lite), `useSiteConfig`, persistQueryClient setup,
   wire all hardcoded sites to the config; compute `yearsActive`.
5. `spotlight` — lazy-loaded home flagship-cards component reading `featured` showcase.
6. Seed `siteConfig/current` with the current hardcoded values (migration/seed script).

## Review gate (before "done")

- `react-best-practices` (auto on .tsx) during implementation.
- `/simplify` on the diff (post-feature cleanup).
- `/code-review` on the diff.
- `firestore-security-reviewer` + `/security-review` (touches `firestore.rules` + a
  new world-read collection — REQUIRED).
- `bundle-budget-watcher` (spotlight adds persistQueryClient dep + a route).
- `secure-dep-vetting` (auto) for `@tanstack/react-query-persist-client` +
  `@tanstack/query-sync-storage-persister`.
- Design validation: `frontend-design` then `ui-ux-pro-max` on the backstage form.

## Claude Design prompt (for the backstage `/config` page)

> Design an admin settings page for a nonprofit chapter's public-site content, called
> "Configuración del sitio". This is the single place a chapter president (non-technical,
> serves a 1-year term) edits the facts shown on the public marketing site.
>
> It is one long form, organized into collapsible sections, each a card:
> 1. **Estadísticas** — numeric stat fields with their public labels: número de programas
>    insignia, países en la red (texto, ej. "100+"), miembros en el mundo (texto, ej.
>    "200.000+"), reconocimientos nacionales (número), eficiencia operativa % (número),
>    y premio destacado {año + título}.
> 2. **Aliados** — editable list of organization names (add/remove/reorder rows).
> 3. **Hitos** — editable timeline list, each row {año, título, descripción}.
> 4. **Comité** — editable list of role labels (Presidente, VP…).
> 5. **Misión / Visión / Valores** — three multiline text areas.
> 6. **Razones para unirse** — editable list of {número, título, cuerpo}.
> 7. **Contacto** — email, ubicación, horario de reunión, y enlaces {etiqueta, url}.
>
> One sticky "Guardar cambios" action; show last-saved timestamp. Spanish UI labels.
> Calm, trustworthy, institutional aesthetic — this is JCI (Junior Chamber International),
> navy/teal brand. Must use the design tokens and components in this repo's
> `@luminova/ui` design system (see DESIGN.md): token-driven spacing/color, existing
> form inputs, DatePicker, Card, Button, collapsible Section. Accessible (WCAG AA
> contrast, labeled fields, keyboard-operable add/remove rows). Desktop-first admin
> layout with a readable max width; the section cards stack in a single column.
>
> Deliver the page composed from existing `@luminova/ui` primitives, plus any new
> field-array row component needed, ready to wire to a React Hook Form + Zod form.

After Claude Design produces the layout, use its handoff so implementation wires it
straight to `useSiteConfig` / `useUpdateSiteConfig`.

## Out of scope / deferred

- Founding years & age range remain hardcoded constants.
- No i18n; Spanish values stay inline per repo convention (English keys / Spanish values).
- No per-field edit history/audit (single `updatedAt` only).
