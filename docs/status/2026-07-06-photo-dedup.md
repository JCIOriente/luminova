# Handoff — Photo stack dedup (audit backlog item 8)

Date: 2026-07-06
Branch: `feat/photo-dedup` (off `main` @ `2bdab66`, after item-7 #137 merged)
Spec: `docs/specs/2026-07-06-photo-dedup.md`

## What shipped

Pure code-dedup (behavior-preserving). Two folds, two commits:

1. **Storage generics** (`f95033a`) — promoted the private `upload`/`remove` in
   `photo-storage.ts` to exported generics in new
   `packages/firebase/src/storage-object.ts`; routed all three domain helpers
   (`member-photo`, `ally-logo`, `photo-storage`) through them.
2. **Hook fold** (`942fee3`) — extracted the ~90%-shared photo-CRUD logic into
   `apps/backstage/src/lib/use-photo-crud.ts` (`usePhotoCrud(source)`); the two
   feature hooks became thin adapters with identical public signatures.

No Storage-layout / rules / bucket change. Every blob path prefix and every
Firestore collection / query-key namespace stays byte-identical.

## The delta table that defined the folded hook's config (PhotoSource)

The two hooks diverged only on these axes → each became one `PhotoSource` field:

| Axis | Activity value | Initiative value | PhotoSource field |
|------|----------------|------------------|-------------------|
| doc id | `activityId` | `id` | `id` |
| repository | `new ActivityRepository()` | `new InitiativeRepository(type)` | `repo` (structural `PhotoRepository`) |
| storage upload | `uploadActivityPhoto(activityId, photoId, blob)` | `uploadInitiativePhoto(kind, id, photoId, blob)` | `uploadPhoto(photoId, blob)` closure |
| storage delete | `deleteActivityPhoto(activityId, photoId)` | `deleteInitiativePhoto(kind, id, photoId)` | `deletePhoto(photoId)` closure |
| invalidate set | `[activityKeys.byId(id), activityKeys.byTerm(termId)]` | `[initiativeKeys(collection).byTerm(termId), initiativeDetailKey(type, id)]` | `invalidationKeys: readonly QueryKey[]` |
| log noun | `"orphan activity photo"` | `"orphan initiative photo"` | `orphanLabel` |

Everything else — `crypto.randomUUID()`, the `Photo` literal
(`uploadedBy: member?.id ?? ""` via `useCurrentMember`), op order, the
`Promise.all` invalidate fan-out — was byte-identical → lives once in `usePhotoCrud`.

## Preserved invariants (must-not-drift)

- **Blob path prefixes** unchanged: `members/{id}/profile.jpg`, `allies/{id}/logo`,
  `programs|projects/{id}/photos/{photoId}.jpg`, `activities/{id}/photos/{photoId}.jpg`.
- **Orphan-tolerant delete**: `deleteObjectQuietly` swallows ONLY
  `storage/object-not-found`, rethrows all else (incl. `storage/unauthorized`).
  Do NOT turn this into a hard failure (memory: feedback-storage-delete-rules).
- **contentType**: default `"image/jpeg"` via `??` NOT `||` (preserves ally's
  empty `file.type`). ally passes `contentType: file.type`.
- **Query-key isolation**: each adapter builds its own key set; `usePhotoCrud`
  only fans out over the handed array, never constructs keys. Activity
  (`["activities",...]`) and initiative (`collection`-headed + `["initiatives",
  "detail",...]`) heads are disjoint → no cross-domain invalidation leak.

## Op order (removePhotoById) — preserved exactly

`repo.removePhoto(id, photoId)` → `deletePhoto(photoId).catch(warn)` (orphan-swallow)
→ `invalidate()`.

## Consumers left un-migrated (intentional)

- `use-member-photo.ts`, `use-set-ally-logo.ts`, `use-remove-ally-logo.ts` — these
  are **single-value** (profile pic / logo), not photo-array-with-cover/caption, so
  the `PhotoRepository` interface (`addPhoto/removePhoto/setCover/setCaption`)
  genuinely doesn't fit. Their STORAGE side IS routed through the generic; only the
  hook shape stays separate. Forcing them into `usePhotoCrud` would be a bandaid.

## Verification

- `packages/firebase`: 15 tests (new `storage-object.test.ts`, incl. `??`-not-`||`
  empty-contentType guard + not-found swallow / rethrow-other).
- `apps/backstage`: 451 tests (new `use-photo-crud.test.tsx` — both sources
  round-trip through the one hook + key-isolation assertion).
- typecheck clean (both packages); knip zero NEW unused exports (`PhotoRepository`
  kept internal); bundle 99.69 kB gz index (budget 115, no regression).
- /simplify (4 angles: 3 clean, 1 skipped — `orphanLabel` kept for per-domain
  orphan-log signal), /code-review high (0 findings), /security-review (0 findings).

## Out of scope (follow-ups)

- **Item 15** — move storage helpers out of `@luminova/firebase` into a domain
  package (architecture finding line 71). This was dedup-in-place, not the package move.
- Item 9 (datetime consolidation) — next in the chain.
