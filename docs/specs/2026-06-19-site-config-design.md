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
- Lists (14–17, except programs and comité): allies, timeline, MVV, reasons
- Contact/org (18–21): email, location, meetingSchedule, links

**NOT editable in site-config — sourced elsewhere:**
- Dates/facts (8–11): founding years 1915/1946/1993, age range 18–40 — stay as code
  constants (set-once, rarely change).
- Flagship program cards (12): **reuse the existing `featured` showcase items**
  already in Firestore; render via a **lazy-loaded** home component so it does not
  block initial page load. No duplicate data entry.
- Exec-committee roles (15): **sourced from the existing position catalog, NOT a new
  editable list.** The CEL positions (`CEL_SEED`, currently in
  `apps/backstage/src/features/positions/lib/cel-seed.ts`) are promoted to a shared
  constant in `@luminova/types`; spotlight imports the role labels directly (it already
  depends on `@luminova/types`). The `positions` Firestore collection stays auth-gated;
  no world-read projection is added. This is the single source of truth — the president
  manages cargos in "Cargos y comités", not in this form.

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
  mvv: { mision: string, vision: string, valores: string }
  reasons: { number: string, title: string, body: string }[]
  contact: { email: string, location: string, meetingSchedule: string,
             links: { label: string, url: string }[] }
}
```

> No `execRoles` field — exec-committee roles come from the `@luminova/types` CEL
> catalog (see Scope). Doc holds 5 editable section-groups, not 6.

**Naming:** schema keys are **English** (`stats`, `allies`, `timeline`, `mvv`,
`reasons`, `contact`), values Spanish, per repo convention. The Claude Design handoff
uses Spanish field keys (`estadisticas`, `premioAnio`, `hitos`…) — map those to the
English schema keys during implementation; they are the UI's concern, not the data
model's.

- One doc → one read, one snapshot, atomic save.
- Unlike `showcase` (beacon-projected), this is **hand-authored** → `backstage`
  writes it **directly**. No beacon involvement.
- Schema lives in `@luminova/types` (shared by backstage form + spotlight reader);
  Zod schema mirrors it. Codegen-drift gate applies (shared contract).
- `firestore.rules`: `match /siteConfig/{doc} { allow read: if true; allow write:
  if isAdmin(); }` — public read, admin-only write.

### Backstage — `/config` ("Configuración del sitio")

- **Singleton page**, not a CRUD list (exactly one doc). Lives as the **"Sitio
  público"** tab inside a `/config` "Configuración" route (sibling tab "Preferencias"
  is out of scope here).
- `siteConfigRepository` (get + update) — existing repository pattern.
- `useSiteConfig` query + `useUpdateSiteConfig` mutation (TanStack Query v5).
- React Hook Form + Zod, one schema. **5 collapsible section cards** (Comité dropped):
  01 Estadísticas · 02 Aliados · 03 Hitos · 04 Misión·Visión·Valores · 05 Razones ·
  06 Contacto. `useFieldArray` for the list sections (allies, timeline, reasons,
  contact.links).
- Sticky save bar: dirty/error state + last-saved timestamp
  (`Intl.DateTimeFormat('es-BO', …)`); `formState.isDirty` drives it, `formState.errors`
  drives per-field messages + blocked-count. Errors surface only after first save attempt.
- Save = `setDoc(merge)` writing fields **+ bump `version`** + `updatedAt` server
  timestamp, in one atomic write.
- Scaffold via `backstage-feature-scaffold`, adapted to singleton (drop list view).
- Build against the Claude Design handoff (below) using `@luminova/ui` primitives.

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

1. `@luminova/types` — `SiteConfig` type + Zod schema (+ codegen-drift gate). Also
   **promote the CEL catalog** (`CEL_SEED` role labels) into a shared constant here;
   update backstage's positions feature to import it (no behavior change).
2. `firestore.rules` — `siteConfig` public-read / admin-write + rules tests.
3. `backstage` — repository, hooks, `/config` route + sectioned form (5 groups).
4. `spotlight` — reader (firestore-lite), `useSiteConfig`, persistQueryClient setup,
   wire all hardcoded sites to the config; compute `yearsActive`; render "Comité
   Ejecutivo" labels from the `@luminova/types` CEL catalog.
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

## Design handoff (Claude Design — DONE)

High-fidelity design produced and reviewed. Handoff bundle:
`design_handoff_configuracion_sitio/` in the linked Claude Design project
`97303bd9-fd99-46af-9104-27338d4b9412` (pull via DesignSync). Key files: `README.md`
(spec: layout, tokens, interactions, validation), `src/pages-configuracion.jsx` (the
reference page — `SitioPublico`, `Collapsible`, `FieldArray`, all sections, sticky save
bar), `src/config-data.jsx` (seed payload shape), `src/dashboard.css` +
`src/colors_and_type.css` (token values).

The handoff is a **visual reference**, not shippable code. Recreate it in-repo with
React Hook Form + Zod + `@luminova/ui` primitives. Deviations from the handoff, decided:
- **Drop section 04 "Comité"** — roles come from the `@luminova/types` CEL catalog, not
  an editable list (per Scope). Renumber the remaining sections 01–06 → 5 groups.
- **Map Spanish field keys → English schema keys** (handoff uses `estadisticas`,
  `premioAnio`, etc.; schema uses `stats`, `standoutOrg`, …).
- The handoff's `FieldArray` row (drag handle decorative; up/down/delete keyboard-operable
  → RHF `move`/`remove`/`append`) is the one new component to build; back it with
  `@luminova/ui` icon buttons. Pointer drag-reorder is optional.
- Tokens: reconcile the handoff's `--jci-*` vars against the repo's existing
  `@luminova/ui` tokens — reuse repo tokens, do not introduce a parallel set.

## Out of scope / deferred

- Founding years & age range remain hardcoded constants.
- No i18n; Spanish values stay inline per repo convention (English keys / Spanish values).
- No per-field edit history/audit (single `updatedAt` only).
