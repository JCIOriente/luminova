# D1 — Events / Activities CRUD (full) — design

_Date: 2026-06-06 · Apps: `apps/backstage` + `@luminova/types` + `firestore.rules` · Branch: `feat/events-crud`_

## Goal

Make the board manage the **Programa → Proyecto → Actividad** hierarchy the
Recognition Engine feeds on. A3 shipped a thin Activity create form with a
free-text parent id; D1 ships real Program + Project management, a real
program/project **parent picker** + member **roster** selects (via the #21
Combobox/MultiSelect widgets), Activity **edit/cancel** with engine-safety
guards, and a minimal **final-report** action that exercises the
provisional→confirmed gate end-to-end.

## Decisions (locked in brainstorm)

- **Widgets:** done (#21). Use `@luminova/ui` `Combobox` (single member / parent
  pick) + `MultiSelect` (team roster).
- **Program/Project:** THIN — create + edit + list + pick + status + roster +
  file-final-report. The rich dossier (phases/budget/KPIs/SDG/evidence) is **C1**
  (blocked on `jci-award-criteria.md`). No hard-delete, no soft-delete in v1
  (status carries lifecycle).
- **Rosters feed roles — engine expansion DEFERRED to its own slice (A7).** D1
  stores the roster as the **authoritative** source on programs/projects and
  edits it via MultiSelect; the check-in flow may **prefill** the role tap from
  the roster (light, read-only). The actual roster→participation auto-expansion
  (new beacon derive path, keying, idempotency, void-on-edit) is a separate
  engine slice. **D1 writes only programs/projects/activities — never
  participations/memberPoints (engine-only).**
- **Activity edit/delete guardrails — soft-state:** "delete" = `update status:
  Cancelada` (Firestore `delete` stays `if false`). Once any check-in references
  the activity, **lock `startAt` + `category`** (editing them would retro-change
  points); other fields stay editable. Guard is a repository pre-flight (rules
  can't query checkIns) — trusted Admin/PM, matches the v1 trust model (#7).
- **`finalReport` action included** — `fileFinalReport` sets
  `finalReport = {filedAt, filedBy: uid}` + `status: "Finalizado"`; A2's existing
  `confirmOnProgramReport`/`confirmOnProjectReport` triggers flip child-activity
  points provisional→confirmed. No beacon change.
- **Term zod NOT added** — D1 uses `currentTermId()`; no Term admin here. Term zod
  defers to a real Term-admin slice. Only **Program + Project** zod added.
- **`programs` read = `signedIn`** (engine-internal), not public. `projects` keeps
  its existing public read (C4 Spotlight projection — out of D1 scope, see G2).

## Data model — `@luminova/types` (root barrel; `/engine` subpath stays zod-free)

New schema files in `packages/types/src/engine/`, exported from the root barrel
(`src/index.ts`), NOT from `engine/index.ts`:

```ts
// initiative-schema.ts
export const initiativeRosterSchema = z
  .object({
    directorId: z.string().min(1, "Requerido."),
    coDirectorId: z.string().min(1).nullable(),
    teamIds: z.array(z.string().min(1)).default([]),
  })
  .superRefine((r, ctx) => {
    if (r.coDirectorId !== null && r.coDirectorId === r.directorId) {
      ctx.addIssue({ code: "custom", message: "El codirector no puede ser el director.", path: ["coDirectorId"] });
    }
    if (r.teamIds.includes(r.directorId)) {
      ctx.addIssue({ code: "custom", message: "El director no puede estar en el equipo.", path: ["teamIds"] });
    }
    if (r.coDirectorId !== null && r.teamIds.includes(r.coDirectorId)) {
      ctx.addIssue({ code: "custom", message: "El codirector no puede estar en el equipo.", path: ["teamIds"] });
    }
  });
export type InitiativeRosterInput = z.infer<typeof initiativeRosterSchema>;

// program-schema.ts
export const programSchema = z.object({
  title: z.string().min(3, "Mínimo 3 caracteres."),
  roster: initiativeRosterSchema,
  status: z.enum(INITIATIVE_STATUSES),
});
export type ProgramInput = z.infer<typeof programSchema>;

// project-schema.ts — identical shape, distinct entity
export const projectSchema = z.object({
  title: z.string().min(3, "Mínimo 3 caracteres."),
  roster: initiativeRosterSchema,
  status: z.enum(INITIATIVE_STATUSES),
});
export type ProjectInput = z.infer<typeof projectSchema>;
```

`finalReport` is **not** in the create/edit schemas (set by `fileFinalReport`).

Extend `activity-schema.ts`: add `coDirectorId: z.string().min(1).nullable()`
alongside the existing `directorId` (A3 hardcoded `coDirectorId: null` in the
mapper). Keep the existing Invariant-A `superRefine`.

## firestore.rules

Add a `programs` match (mirrors `activities`):

```
match /programs/{programId} {
  allow read: if signedIn();
  allow create, update: if hasAnyRole(['Admin', 'ProjectManager']);
  allow delete: if false;
}
```

`projects` (public read, Admin/PM create+update, delete false) and `activities`
(signedIn read, Admin/PM create+update, delete false) are **unchanged** — D1's
edit/cancel + finalReport all go through `update`, which is already permitted.
`participations`/`memberPoints` untouched. New rules-tests cover the `programs`
match (signedIn read; Admin/PM write; non-role denied; delete denied).

## Backstage features

Three feature folders under `apps/backstage/src/features/`, house pattern
(repository class · TanStack Query keys/hooks · RHF+Zod forms in `Sheet`).

### `programs/` and `projects/` (distinct, near-identical — 1:1 like members/allies)

- `ProgramRepository` / `ProjectRepository`:
  - `getByTerm(termId)` — `where("termId","==",termId)`, JS sort by `title`
    (`localeCompare` es).
  - `getById(id)` — `Program | null` / `Project | null`.
  - `create(data, termId)` — via `toProgramCreateDoc` (roster passthrough,
    `finalReport: null`, status from form).
  - `update(id, data)` — via `toProgramUpdateDoc`.
  - `fileFinalReport(id, uid)` — `updateDoc({ finalReport: { filedAt:
    serverTimestamp(), filedBy: uid }, status: "Finalizado" })`. Pre-flight
    `getById` to reject a missing/already-filed doc.
- Mappers `program-mapper.ts` / `project-mapper.ts` (pure, tested).
- Hooks: `program-keys.ts`, `use-programs-by-term`, `use-create-program`,
  `use-update-program`, `use-file-program-report` (mutations invalidate the key);
  mirror for projects.
- Routes `_app.programs.tsx` / `_app.projects.tsx`:
  - Table: title · director name (resolve via `useMembers`) · status `Badge` ·
    final-report state (filed date or "—"). `EmptyState` when none.
  - Sheet form: `title` `Input`; roster — director **Combobox** (required),
    co-director **Combobox** (nullable), team **MultiSelect**, all over the active
    members list; `status` `Select`. RHF + zodResolver.
  - Row actions (gated `<Can update Program/Project>`): edit (opens Sheet), "Marcar
    informe final" (`Dialog` confirm → `fileFinalReport`, hidden once filed).
  - Create gated `<Can create Program/Project>`.
- Nav: under the existing **"Reconocimiento"** group add "Programas" + "Proyectos"
  (CASL subjects `Program`/`Project` — ProjectManager already has `manage
  Project`; add `manage Program` to ProjectManager + Admin `manage all` covers it).

### `activities/` (extend A3 — do not replace)

- `ActivityRepository` gains:
  - `getById(id)` — `Activity | null`.
  - `update(id, data)` — via new `toActivityUpdateDoc`; pre-flight `countCheckIns`
    and throw `ActivityLockedError` if `startAt`/`category` changed while
    check-ins exist.
  - `cancel(id)` — `updateDoc({ status: "Cancelada" })`.
  - `countCheckIns(activityId)` — `getCountFromServer(query(checkIns, where(
    "activityId","==",id)))` → number.
- `activity-mapper.ts`: add `toActivityUpdateDoc`; set `organizers.coDirectorId`
  from the form (A3 left it null).
- Components:
  - `ParentPicker.tsx` — shown only when `category === "ProjectExecution"`:
    `parentType` toggle (Program/Project) + **Combobox** over the chosen type's
    `getByTerm` initiatives → sets `parentId`. Enforces Invariant A with the
    schema.
  - Activity form: category `Select`, `ParentPicker`, director/co-director
    **Combobox** (members), `startAt` `datetime-local`. In edit mode, when
    `countCheckIns > 0`, `startAt` + `category` render disabled with helper text
    "No editable: ya hay registros de asistencia".
  - Table gains edit + "Cancelar actividad" (`Dialog` confirm → `cancel`) row
    actions + parent-title / director-name columns; status `Badge` shows Cancelada.
- Route `_app.activities.tsx` (exists) extended; `handleSubmit`/confirm wrapped in
  try/catch → toast on `ActivityLockedError` / write failure.

### Check-in prefill (light)

`/check-in` ActivityPicker: when the selected activity has a parent, default the
manual-tap role from the parent roster (director→Director, etc.) — read-only
convenience, **no engine write**. Kept minimal; deferred if it complicates A3.

## Error handling

- Form validation: RHF + Zod (roster distinctness, Invariant A, min-length).
- Write failures + `ActivityLockedError`: caught in route handlers → `Toast`.
- `fileFinalReport` on a missing/already-filed doc: repository throws → toast.

## Testing

- **types** (pure): `initiative-schema` (distinctness ×3), `program-schema`,
  `project-schema`, `activity-schema` co-director addition.
- **backstage** (jsdom, reuse #21's cmdk stubs): program/project mappers (pure),
  repository guard logic where pure-extractable, form render tests (Combobox/
  MultiSelect interaction), edit-guard lock behavior, ParentPicker conditional.
- **rules**: new `programs` match (read/write/delete role matrix).
- No beacon tests (no beacon change).

## Reviews

- `firestore-security-reviewer` + `/security-review` — new `programs` rule + new
  write paths (`update`, `fileFinalReport`, activity `cancel`).
- `bundle-budget-watcher` — first real route consumption of the #21 widgets
  (cmdk + popover now land in `programs`/`projects`/`activities` chunks). Also
  re-check the inert `size-limit` gate (follow-up #8) — wire or note.
- `firebase-functions-reviewer` — **not** triggered (no `apps/beacon` change).

## Verification

- `pnpm --filter @luminova/types run ci`, `pnpm --filter backstage run ci`.
- rules tests via `pnpm --filter @luminova/firestore-rules-tests run test:run`
  (direct, not `emulators:exec`, when an emulator is already up — known gotcha).
- `pnpm pr-tests` (format + all-ci + knip) before PR.
- New backstage routes → run bare `pnpm exec vite build` first so the router
  plugin regenerates `routeTree.gen.ts`, then the full `build` (known gotcha).

## Deferred (explicit)

Roster→participation engine expansion (A7, next slice); Term admin + Term zod;
rich Project dossier/report (C1); programs/projects hard- or soft-delete;
upcoming-events feed; `size-limit` wiring (follow-up #8, note in PR).
