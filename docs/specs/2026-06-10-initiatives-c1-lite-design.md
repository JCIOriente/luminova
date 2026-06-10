# Initiatives C1-lite — Projects & Programs UX + rich model (design)

**Date:** 2026-06-10 · **Status:** approved (brainstorm) · **Tracks:** C1 (decoupled slice), H2, D1 follow-ups

## Goal

Turn the engine-minimal `Program`/`Project` records into a first-class product surface:
a premium card-grid list, a rich detail page (in-execution and completed views), team
management, child activities as the milestone unit, a manual completion ceremony that
captures impact data, and photo galleries. Programs and projects are "basically the
same" to users — the long-term narrative differs — so they share one UI while staying
distinct entities in the engine.

**Decoupling decision:** the roadmap gated C1 on `docs/reference/jci-award-criteria.md`
(still missing). This slice ships the manage-layer + UX now; dossier fields and export
(C2) wait for the criteria document. Nothing here blocks or presupposes the dossier
shape.

## Decisions log (from brainstorm)

1. Category = the **4 official JCI áreas de oportunidad** (strict enum, no free-form tag).
2. Progress = **derived from child activities only** (`Ejecutada / (total − Cancelada)`); never stored.
3. Card team avatars = roster, capped at 3 + "+N".
4. Completion impact = **required** `personsImpacted` + `volunteers` + required `closingSummary` + optional custom `{label, value}` pairs.
5. Initiative-level photos = cover / destacadas, on top of the child-activity photo roll-up.
6. Status change is **manual**, allowed for: `Admin` ∪ `ProjectManager` ∪ the initiative's director/co-directors (member↔uid match). President/Exec-VP are covered by the Admin permission role (role ≠ title doctrine); no board-seat lookup.
7. Activities page stays in the sidebar as list + detail, but its create button offers **standalone categories only** (Assembly/Course/TM/Anniversary/NationalEvent). `ProjectExecution` activities are created only from inside their parent initiative. The `/check-in` sidebar item is removed; check-in lives on the new activity detail page.
8. **No data migration** — wipe data and update `tools/scripts/seed-emulator.mjs` to the new shapes.
9. **Direction points are initiative-level only.** `organizers` on a parented activity is informational (who runs that course); it awards no direction points. Participation at parented activities is attendance via check-in (existing "execution activities tap Attendee" convention). `DirectActivity`/`CoDirectActivity` point codes apply **only to standalone activities**. Verify the engine already enforces this; fix in slice 1 if not.
10. Architecture: **extend in place, unify the surface** — keep `programs` + `projects` collections distinct (engine, rules, and point codes reference them), extend both with one shared `InitiativeCore` shape, and ship a single unified UI.

## Data model (`@luminova/types/engine`)

```ts
// initiative.ts
export const AREAS_OF_OPPORTUNITY = [
  "DesarrolloIndividual",
  "DesarrolloComunitario",
  "NegociosEmprendimiento",
  "CooperacionInternacional",
] as const;
export type AreaOfOpportunity = (typeof AREAS_OF_OPPORTUNITY)[number];
// + AREA_OF_OPPORTUNITY_LABELS: Record<AreaOfOpportunity, string> (Spanish display)

export interface InitiativeRoster {
  directorId: string;
  coDirectorIds: string[];      // BREAKING: was coDirectorId: string | null
  teamIds: string[];
}

export interface ImpactMetric { label: string; value: string; }

export interface InitiativeImpact {   // written by the completion wizard
  personsImpacted: number;            // required
  volunteers: number;                 // required
  custom: ImpactMetric[];             // optional extras ("Juguetes entregados: 1.200")
  closingSummary: string;             // required narrative
}

export interface Photo {              // shared with Activity
  id: string;
  url: string;
  caption: string | null;
  uploadedAt: Timestamp;
  uploadedBy: string;                 // member id
}

// Shared core — Program and Project are both `InitiativeCore` verbatim (still two
// interfaces / two collections; the engine and point codes distinguish them).
interface InitiativeCore {
  id: string;
  termId: string;
  title: string;
  description: string;                // new — card + detail blurb
  category: AreaOfOpportunity;        // new
  startDate: Timestamp;               // new
  endDate: Timestamp;                 // new — estimated close; drives "Por cerrar"
  roster: InitiativeRoster;
  photos: Photo[];                    // new — cover/destacadas; photos[0] = cover
  impact: InitiativeImpact | null;    // null until completed
  finalReport: FinalReport | null;    // unchanged — completion wizard sets it
  status: InitiativeStatus;           // unchanged enum; manual transitions
}
```

```ts
// activity.ts
export interface ActivityOrganizers {
  directorId: string | null;
  coDirectorIds: string[];            // BREAKING: was coDirectorId: string | null
}

export interface Activity {
  // existing: id, termId, category, parentType, parentId, organizers, startAt, status
  title: string;                      // new — galleries and lists name activities
  description: string | null;         // new
  endAt: Timestamp | null;            // new — startAt stays the punctuality anchor
  photos: Photo[];                    // new — gallery anchor
}
```

Zod schemas updated alongside; old shapes are rejected (no migration — see decision 8).

### Derived values (computed, never stored)

- **Progress** = `count(Ejecutada) / count(status !== Cancelada)` over child activities; `0/0 → 0%`.
- **"Por cerrar" badge** = `status === EnEjecucion && (all activities Ejecutada || endDate ≤ 30 days away)`.
- **Project gallery** = child-activity `photos` grouped by activity, plus the initiative's own `photos` as cover/destacadas.
- **Status display map:** `Planificacion → "Planificación"`, `EnEjecucion → "En curso"`, `Finalizado → "Completado"`. Completed detail shows "Cerrado en {month of finalReport.filedAt}".

## Engine / beacon

- **A7 reconciler** (`processInitiativeWrite`): iterate `coDirectorIds[]` — each
  co-director gets their own `CoDirectProgram`/`CoDirectProject` participation row
  (anchored on initiative id + member id, idempotent as today). Removing a co-director
  voids their row (existing voiding semantics, untouched).
- **Parented activity organizers award nothing** (decision 9). Verify current behavior;
  the engine must not create direction participations from `organizers` of activities
  with `parentId !== null`. Standalone activity direction keeps awarding
  `DirectActivity`/`CoDirectActivity` (via check-in role, as today).

## Completion ceremony (one ceremony, not two)

"Marcar como completado" (permission-gated) opens a multi-step wizard
(Sheet/Dialog):

1. Confirm + `closingSummary` (required).
2. `personsImpacted` + `volunteers` (required numbers) + custom metric pairs (optional).
3. Optional photo picks / cover selection — **ships with slice 6** (galleries); the
   wizard is two steps until then.

Submit performs **one document update**: `status: "Finalizado"` + `impact` +
`finalReport { filedAt, filedBy }`. The existing report-confirm trigger then flips
child points provisional → confirmed. The separate `fileFinalReport` button is removed.

**Reopening is blocked once `finalReport` is filed** (clearing it would un-confirm
points). Backward transitions allowed only `Planificacion ⇄ EnEjecucion`.

## Permissions & security

- **Status change / edits / photo upload** on an initiative: `Admin` ∪ `ProjectManager`
  ∪ that initiative's `directorId`/`coDirectorIds` (member↔uid match). CASL on the
  client, mirrored branch in `firestore.rules`.
- **Mechanism:** rules can't iterate roster arrays, so beacon mirrors the direction
  members' auth uids onto each initiative as `directionUids: string[]` (engine-written,
  client-immutable; clients create it as `[]`). Rules check
  `request.auth.uid in directionUids`. Known limitation: if a member's login is
  provisioned after they joined a roster, re-save the initiative to refresh the mirror.
- **Activity** status/edit/photos: same set evaluated against the activity's
  `organizers` ∪ the parent initiative's direction.
- Existing activity guards unchanged: `startAt`/`category` lock once check-ins exist.
- Reviews required: `/security-review` + `firestore-security-reviewer` on slices 1, 5, 6;
  `firebase-functions-reviewer` on slice 1.

## Storage

- Paths: `projects/{id}/photos/{photoId}.jpg`, `programs/{id}/photos/{photoId}.jpg`,
  `activities/{id}/photos/{photoId}.jpg`.
- Reuse H1 infra: `ImageUploader` (landscape-friendly crop, client downscale ~1600px,
  ≤5 MB), upload helpers in `@luminova/firebase`.
- `storage.rules` branches for the three paths (write: the permission set above;
  read: signed-in) + `@luminova/storage-rules-tests` extension.
- Photo metadata lives in the Firestore doc (`photos[]`); the binary in Storage.

## UI/UX

Premium feel is a hard requirement. Every UI slice starts with `frontend-design`
(aesthetic direction) then `ui-ux-pro-max` (palette/typography/a11y validation) —
in that order, per CLAUDE.md.

### Navigation

- Sidebar items `Programas`, `Proyectos`, `Check-in` → one **`Proyectos`** item
  (`/initiatives`). `Actividades` stays (standalone-only create, per decision 7).

### List — `/initiatives` (mockup 1)

- Header + "Nuevo" split-button (proyecto / programa).
- Status tabs with counts: Todos / Activos / Completados.
- Filter chips: type (Programa/Proyecto) + área de oportunidad. Search by title.
- Card: área label (color-coded per area) + status pill, title, 2-line description,
  progress bar ("Avance X%"), roster avatar stack (3 + "+N", reuses H1 `Avatar`),
  flag icon + end date ("Ago 2026"). Cover photo as card visual when present.
- Client-side filtering/pagination (chapter scale = dozens/year); server pagination
  out of scope.

### Detail — `/initiatives/$type/$id`, in execution (mockup 2)

- Breadcrumb back to Proyectos. Hero: área + status pill, title, description.
- Tab pills: **Resumen** / **Actividades** `n/m`.
- Resumen: progress card (% + "X de Y actividades ejecutadas, Z pendientes"),
  Cronograma (Inicio / Cierre estimado timeline), right rail **Equipo**
  (Director destacado, co-directors, team members with their `member.role` label).
- Mockup's "Impacto previsto" is **dropped for v1** — impact is captured only at
  completion.
- Actividades tab: child activity list (title, date, status, organizers) +
  "Nueva actividad" (creates `ProjectExecution` with parent prefilled) +
  click-through to activity detail.

### Detail — completed (mockup 3)

- Same hero + "Cerrado en {month}". `closingSummary` paragraph.
- "Logros del proyecto": `personsImpacted` / `volunteers` / custom pairs as stat cards.
- "Galería de actividades": photos grouped and captioned by activity title, plus
  initiative-level destacadas. Equipo rail unchanged.

### Activity detail — `/activities/$id` (new)

- Title, category, parent link (when parented), dates, organizers, status, photos,
  description.
- Primary **Check-in** action embeds the existing scanner/roster surface (moved from
  `/check-in`). Edit/cancel live here.
- Activities list page: create offers standalone categories only.

### `@luminova/ui` candidates

`ProgressBar`, `AvatarStack`, `StatCard`, `Tabs` (pill variant), `PhotoGallery` —
promoted to the package only if genuinely reusable; otherwise feature-local.

## Slicing (one branch/PR each, off `main`)

| # | Branch | Scope | Risk |
|---|--------|-------|------|
| 1 | `feat/initiative-schema` | Types/zod (InitiativeCore, Photo, Impact, `coDirectorIds[]`, Activity title/endAt/photos), beacon A7 multi-co-director + parented-organizer rule verify/fix, `firestore.rules` status-change branch, seed update | High (engine) |
| 2 | `feat/initiatives-list` | `/initiatives` card grid + tabs/chips/search, nav consolidation, shared repo interface over program/project repos | Low |
| 3 | `feat/initiative-detail` | Detail route (Resumen + Actividades tabs, Equipo rail, progress), activity create-from-parent | Med |
| 4 | `feat/activity-detail` | `/activities/$id` + check-in embed, sidebar Check-in removal, standalone-only create on activities page | Med |
| 5 | `feat/initiative-completion` | Wizard, completed view (logros + summary), reopen-block rule | Med |
| 6 | `feat/initiative-galleries` | Photo upload (activities + initiative destacadas), `storage.rules` + tests, gallery UI | Med |

Order: 1 → 2 → 3 → 4 ∥ 5 → 6.

Per-PR discipline: TDD; `/simplify` when functionally done; `/security-review` where
flagged; matching reviewer subagents; `superpowers:requesting-code-review` before PR;
`pnpm pr-tests` after opening.

## Testing

- Pure helpers unit-tested: progress calc, "Por cerrar" rule, status display map,
  permission predicate, gallery grouping.
- Beacon: extend reconciler tests — multi-co-director expansion, void on removal,
  no direction rows from parented-activity organizers.
- Rules: `firestore-rules-tests` (status-change permission branch) +
  `storage-rules-tests` (photo paths).
- UI: component tests for wizard validation. E2E deferred per repo convention.

## Out of scope (explicit)

- C2 award dossier fields/export (gated on `jci-award-criteria.md`).
- C4 Spotlight public showcase page (deferred to a next PR) — but the completion
  wizard already captures the public-facing data (summary, metrics, photos), and G2's
  curated-public-projection note stands: Spotlight will read curated fields, not raw docs.
- Server-side pagination; "Impacto previsto" (pre-completion impact estimates);
  offline check-in (A4).
