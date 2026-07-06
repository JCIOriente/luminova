# Photo stack dedup (audit backlog item 8)

Status: design
Date: 2026-07-06
Branch: `feat/photo-dedup`
Audit rows: item 8 (line 49); detail 85, 87, 100; architecture follow-up 71.

## Problem

Two near-identical (~90% shared) photo-CRUD hooks and three copy-pasted storage
upload/delete reimplementations, diverging only in domain-specific parameters.

1. **Hooks** — `use-activity-photos.ts` and `use-initiative-photos.ts` are
   byte-identical modulo: the repository constructed, which storage fn is called,
   the query-key invalidation set, and a log/error noun. Same
   `addPhoto/removePhotoById/setCover/setCaption` + `Promise.all` double-invalidate.
2. **Storage** — `member-photo.ts`, `ally-logo.ts`, and `photo-storage.ts` each
   redefine the same `upload(path, blob)` + `remove(path)` (delete-swallows-
   `storage/object-not-found`). `photo-storage.ts` already holds a truly generic
   pair but keeps them **private**, so the other two cannot reuse them.

This is CODE dedup only. Every blob path prefix, every Firestore collection, every
query-key namespace stays byte-identical. No Storage-layout / rules / bucket change.

## Design

### A. Storage generics (`packages/firebase/src/storage-object.ts`, new)

Promote the private `upload`/`remove` in `photo-storage.ts` to two exported generics:

```ts
export function uploadObject(path, data: Blob, opts?: { contentType?: string }): Promise<string>
export function deleteObjectQuietly(path): Promise<void>   // swallows storage/object-not-found
```

- `contentType` defaults to `"image/jpeg"` (preserves member / initiative / activity
  behavior); `ally-logo` passes `contentType: file.type` (its one divergence).
- `deleteObjectQuietly` keeps the orphan-tolerant catch verbatim
  (`(err as { code?: string }).code !== "storage/object-not-found"`). **Do NOT** turn
  the swallow into a hard failure (memory: feedback-storage-delete-rules — orphan-
  tolerant delete is intentional).
- Not re-exported from `index.ts` (internal primitive); the four domain files import
  it relatively. Path prefixes stay in the domain files:
  - `members/${id}/profile.jpg`
  - `allies/${id}/logo`
  - `programs|projects/${id}/photos/${photoId}.jpg`
  - `activities/${id}/photos/${photoId}.jpg`

`member-photo.ts`, `ally-logo.ts`, `photo-storage.ts` keep their **public fn exports
unchanged** (thin path-binding wrappers) → zero consumer churn.

### B. Folded hook (`apps/backstage/src/lib/use-photo-crud.ts`, new)

`lib/` already holds cross-feature hooks (`use-dismissing-toast.ts`). Mirrors the
item-7 INITIATIVE_CONFIG pattern: a **config object**, not scattered ternaries.

```ts
interface PhotoRepository {           // both repos already satisfy this structurally
  addPhoto(id, photo: Photo): Promise<void>
  removePhoto(id, photoId): Promise<void>
  setCover(id, photoId): Promise<void>
  setCaption(id, photoId, caption): Promise<void>
}
interface PhotoSource {
  id: string
  repo: PhotoRepository
  uploadPhoto(photoId, blob): Promise<string>   // domain closure, path bound
  deletePhoto(photoId): Promise<void>           // domain closure, path bound
  invalidationKeys: readonly QueryKey[]          // the isolation-critical set
  orphanLabel: string                            // console.warn noun
}
function usePhotoCrud(source: PhotoSource): PhotoCrud
```

`usePhotoCrud` owns the once-only logic: `crypto.randomUUID()`, the `Photo` literal
(`uploadedBy: member?.id ?? ""` via `useCurrentMember`), operation ORDER
(`repo.removePhoto` → storage delete-swallow → invalidate), and the
`Promise.all(invalidationKeys.map(...))` fan-out.

**Query-key isolation preserved**: each adapter builds its OWN `invalidationKeys`;
`usePhotoCrud` never constructs keys, only invalidates the array it's handed. Activity
keys (`["activities", ...]`) and initiative keys (`collection`-headed +
`["initiatives","detail",...]`) never collide — same collision class as item 7.

### C. Thin adapters keep the public hook exports

`useActivityPhotos(activityId, termId)` and
`useInitiativePhotos(type, id, termId)` keep identical signatures → the two route
consumers (`_app.activities_.$id.tsx`, `_app.initiatives_.$type.$id.tsx`) are
untouched. Each adapter memoizes `repo` / `uploadPhoto` / `deletePhoto` /
`invalidationKeys` for referential stability, then delegates to `usePhotoCrud`.

## Blast radius (verified)

- Hooks: only the two route files consume them. Spotlight/beacon: **zero** imports.
- Storage helpers: `member-photo`→`use-member-photo`; `ally-logo`→`use-set/remove-
  ally-logo`; `photo-storage`→the two photo hooks. Spotlight uses only
  `getFirestoreLite`; beacon imports `@luminova/firebase` nowhere (one comment ref).

## Tests (RED-first)

- `storage-object.test.ts`: `deleteObjectQuietly` swallows `storage/object-not-found`
  and **rethrows** any other code; `uploadObject` defaults contentType to
  `image/jpeg` and honors an override.
- `use-photo-crud.test.tsx`: both a fake activity source and a fake initiative source
  round-trip through the one hook — `addPhoto` uploads → `repo.addPhoto` → invalidates
  exactly the source's keys; `removePhotoById` repo-removes → storage-deletes → still
  invalidates when the delete rejects with not-found (orphan-tolerant).

## Guardrails

- `knip`: zero NEW unused exports after deleting the duplicated bodies.
- `bundle-budget-watcher`: deleting duplication → net-neutral-to-favorable.
- Out of scope: item 15 (move storage helpers to a domain package — that's the
  architecture follow-up on line 71), item 9 (datetime), refuted findings.
