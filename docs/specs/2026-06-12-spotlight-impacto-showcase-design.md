# Spotlight "Impacto" Public Showcase (C4) — design

**Date:** 2026-06-12 · **Status:** approved (brainstorm) · **Track:** C4 (consumes C1-lite completion + gallery data)

## Goal

Surface completed initiatives (programs + projects) on the public marketing site
(`apps/spotlight`, no auth) as a recognition showcase: a chronological grid index
and a per-initiative detail page with impact metrics, closing narrative, photo
gallery, and full team credits. This consumes the data the C1-lite completion
wizard (slice 5) and galleries (slice 6) already capture.

**G2 projection rule (carried from the C1-lite spec):** the public site reads
**curated fields, not raw docs.** Firestore rules cannot field-filter reads, so a
public read rule on `programs`/`projects` would leak the whole document (roster
member ids, `termId`, `directionUids`, internal status). Instead a beacon trigger
projects each completed initiative into a curated, denormalized `showcase`
collection that contains only public fields (member ids already resolved to
display names). The public site reads `showcase` and never touches `programs`,
`projects`, or `members`.

## Decisions log (from brainstorm)

1. **Scope:** index + detail pages (not a home-section swap).
2. **Pipeline:** beacon projection collection `showcase`, read live by Spotlight via
   `@luminova/firebase`. (Rejected: direct raw-doc read — violates G2; build-time
   static JSON — stale until redeploy.)
3. **Team credits:** full roster names public (director, co-directors, equipo).
   The trigger resolves roster ids → `member.name` and denormalizes them; the
   public site never reads `members`.
4. **Index layout:** flat chronological grid (newest completed first), programs +
   projects intermixed, client-side área-de-oportunidad filter chips.
5. **Route + nav:** `/impacto` index, `/impacto/$id` detail; new header link
   "Impacto". Home's dead "Ver todos los programas" link → `/impacto`. The
   hardcoded "Programas insignia" flagship section stays as evergreen marketing.
6. **Photos:** `Photo.url` is a tokenized `getDownloadURL()` capability URL, which
   is publicly fetchable regardless of `storage.rules` → renders via `<img>` on the
   public site with **no storage.rules change**. v1 gallery = initiative `photos[]`
   (cover + destacadas). Child-activity photo roll-up is **deferred** (would require
   an activity-write trigger to avoid post-completion staleness).
7. **Projection mechanism:** extend the existing `initiativeTrigger()`
   (`onProgramWritten` / `onProjectWritten`) rather than add a new trigger — reuses
   the document subscription and matches the `directionUids`-mirror pattern already
   in that handler.

## Architecture

```
programs/{id} | projects/{id}  (write: completion wizard sets status=Finalizado + impact)
        │
        ▼  onProgramWritten / onProjectWritten  (beacon, admin SDK)
   projectShowcase step:
     completed (status==Finalizado && impact!=null)  → resolve roster names → upsert showcase/{id}
     not-completed (reopened) | deleted               → delete showcase/{id}
        │
        ▼
   showcase/{id}   (curated, denormalized; read: true, write: false)
        │
        ▼  @luminova/firebase client read (no auth)
   apps/spotlight  /impacto  +  /impacto/$id
```

## `showcase` collection — curated public projection

New shared type in `@luminova/types` (e.g. `engine/showcase.ts`), consumed by both
beacon (writer) and spotlight (reader):

```ts
export interface ShowcasePerson {
  name: string;                 // resolved member.name snapshot; no member id
}

export interface ShowcaseItem {
  id: string;                   // == initiative id
  kind: "Program" | "Project";
  title: string;
  description: string;
  category: AreaOfOpportunity;
  startDate: Timestamp;
  endDate: Timestamp;
  completedAt: Timestamp;       // == finalReport.filedAt (drives chronological order)
  impact: InitiativeImpact;     // personsImpacted, volunteers, custom[], closingSummary
  photos: Photo[];              // cover (photos[0]) + destacadas; tokenized public urls
  team: {
    director: ShowcasePerson | null;   // null if roster director unresolvable
    coDirectors: ShowcasePerson[];
    members: ShowcasePerson[];
  };
}
```

Notes:
- `completedAt` uses `finalReport.filedAt`. Slice-5 rules guarantee
  `status==Finalizado ⇒ finalReport!=null && impact!=null`, so both are present
  for any projected item.
- Member resolution: the trigger reads `members/{id}` (admin) for each roster id and
  snapshots `name`. Unresolvable ids are dropped (filtered out), the director
  becomes `null` if its id can't be resolved. Names are a snapshot — a later member
  rename does not retro-update the showcase doc until the initiative is next written.
  Accepted (recognition is point-in-time).
- `photos` is copied verbatim from the initiative doc (already tokenized public urls).

## Beacon — projection step

Extend `initiativeTrigger(collection)` in `apps/beacon/src/index.ts`. After the
existing `processInitiativeWrite` (directionUids/points), add a projection:

- **Pure mapper** (`award-points/`-sibling module, unit-tested): given the parsed
  initiative doc + a resolved-names lookup, produce a `ShowcaseItem` or `null`
  (null ⇒ not completed ⇒ should be absent from `showcase`).
- **Trigger glue:** on write, if the mapper returns an item → read roster member
  names → `showcase/{id}.set(item)`; if it returns null OR the initiative was
  deleted → `showcase/{id}.delete()`.
- Member name reads use `db.getAll(...memberRefs)` (chunked if needed, mirroring the
  existing roster-read fast-follow note). Missing member → dropped.
- Idempotent: re-running on retry produces the same doc (uses `finalReport.filedAt`,
  not `now()`).

The projection must NOT block points/directionUids work — keep it after, and a
projection failure should be logged but is non-fatal to the rest of the handler
(or runs in the same try with the existing error semantics — chosen in the plan).

## firestore.rules

```
match /showcase/{id} {
  allow read: if true;          // public marketing data, curated
  allow write: if false;        // beacon admin SDK only (bypasses rules)
}
```

No change to `programs` / `projects` / `members` rules. No `storage.rules` change.

## apps/spotlight

- **New dep:** `@luminova/firebase` (read-only client; the app currently has no
  Firebase). `@luminova/types` for `ShowcaseItem`. Requires the same `VITE_FIREBASE_*`
  env the other apps use (public web config — safe for a public site; the API key
  is not a secret, access is governed by rules and the data is already public).
- **Data layer:** a small read-only repository/hook (`useShowcaseList`,
  `useShowcaseItem`) over the `showcase` collection via TanStack Query (already in
  the stack? — spotlight currently has none; add `@tanstack/react-query` if absent,
  else a plain firestore read in a `useEffect`/loader). Decided in the plan; prefer
  the lightest option that fits spotlight's current shape.
- **Routes:**
  - `/impacto` — `ShowcaseGrid`: cards (cover image, área badge, title, impact
    teaser e.g. "1.200 personas impactadas"), newest-`completedAt` first. Área
    filter chips (4 áreas, client-side). Empty state when zero completed (graceful
    marketing copy, not a broken page). Loading skeletons.
  - `/impacto/$id` — `ShowcaseDetail`: hero (cover, título, área badge, date range),
    impact band (personsImpacted · volunteers · custom metrics), closing-summary
    prose, `PhotoGallery`, team credits (director / co-directores / equipo by name).
    Not-found state for an unknown/uncompleted id.
- **Components:** feature-local first (`components/showcase/*`). Promote
  `PhotoGallery` to `@luminova/ui` only if it transfers cleanly from the backstage
  feature-local version (slice-6 deferral point); otherwise keep a spotlight-local
  read-only gallery. Reuse existing spotlight primitives (`SectionHeader`, `Reveal`,
  `RippleBackground`, card patterns, `Badge`/áreas tints).
- **Design:** production-grade. Run `frontend-design` (aesthetic direction) then
  `ui-ux-pro-max` (palette/typography/a11y/contrast validation). Match the existing
  spotlight brand (JCI teal/blue/navy, the `t-*` type scale, `.section`/`.container`
  layout, área framing from the home page).

## Testing

- **Beacon:** unit-test the pure projection mapper — completed → `ShowcaseItem` with
  resolved names + correct `completedAt`; not-completed → null; missing-member drop;
  director-unresolvable → null director. Trigger-level: upsert on completion, delete
  on reopen/delete (extend existing trigger tests / store fake).
- **Rules:** `firestore-rules-tests` — `showcase` public read allowed,
  client write denied (any role).
- **Spotlight:** component tests for grid (ordering, área filter, empty state) and
  detail (impact band, gallery, team credits, not-found). E2E deferred per repo
  convention.
- **Types codegen-drift:** `ShowcaseItem` is a cross-boundary contract (beacon writes,
  spotlight reads) — both consume `@luminova/types`, satisfying the drift gate.

## Accepted limitations (don't re-flag)

- Team/impact names are a point-in-time snapshot; member renames don't retro-update
  until the initiative is re-written.
- Activity-photo roll-up deferred — gallery shows initiative cover + destacadas only.
- Two-system nature (initiative write → projection) is eventually-consistent: a
  freshly completed initiative appears on `/impacto` after the trigger runs (seconds).
- No pagination/search — chapter scale; revisit if completed count grows large.

## Out of scope (explicit)

- C2 award dossier fields/export (still gated on `jci-award-criteria.md`).
- Activity-photo roll-up + activity-write trigger.
- Server-side pagination, full-text search, share/OG-image generation.
- Editing/curation UI on the public side (read-only showcase).
```
