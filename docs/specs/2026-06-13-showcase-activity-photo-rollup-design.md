# Showcase activity-photo roll-up — design

**Date:** 2026-06-13
**Status:** Approved
**Track:** C4 fast-follow (Spotlight Impacto showcase)
**Predecessor spec:** `docs/specs/2026-06-12-spotlight-impacto-showcase-design.md`

## Problem

The public `/impacto` showcase renders only an initiative's **own** `photos[]` (cover +
destacadas). Photos attached to its child **activities** never appear. The showcase doc is
projected only when the parent Program/Project is written, so even if we read activity
photos at projection time they would go stale the moment an activity's photos changed —
no trigger fires on an activity write today.

## Goal

Surface executed child-activity photos in the public showcase gallery, kept fresh by a new
activity-write trigger.

## Decisions (locked)

| Knob | Choice |
|------|--------|
| Presentation | **Flattened** — activity photos appended to `ShowcaseItem.photos`, after the initiative's own. No per-activity labeling. |
| Eligibility | **Only `Ejecutada`** activities contribute (exclude `Programada` / `Cancelada`). |
| Photos per activity | **All** photos on each eligible activity. |
| Trigger cost | **Re-project on every activity write** (admin-scale volume — acceptable). |

## Architecture

### 1. Pure helper — `apps/beacon/src/showcase/project-initiative.ts`

```
activityShowcasePhotos(
  kind: InitiativeKind,
  docs: { id: string; data: Record<string, unknown> }[],
): ShowcasePhoto[]
```

- Filters `data.parentType === kind && data.status === "Ejecutada"`.
- flatMaps each activity's `photos` through the existing `asPhotos` mapper.
- **Namespaces every photo id → `${activityId}:${photo.id}`** so flattened gallery keys
  never collide with initiative photos or across activities (`PhotoGallery` keys on
  `photo.id`).
- Pure, no Firestore access → fully unit-testable.

### 2. `projectShowcase` (index.ts) gains one query

After it builds a projectable `item` (unchanged guard path), it:

1. Queries `activities where parentId == id` — single-field, **auto-indexed** (no composite
   index, no `firestore.indexes.json` change). `parentId` is globally unique per initiative,
   so the result set is tight; `parentType` is still filtered in the helper to disambiguate
   the (rare) cross-collection id collision.
2. Maps the docs through `activityShowcasePhotos(kind, …)`.
3. `item.photos = [...item.photos, ...activityPhotos]`, then `set`.

The query runs **only when the parent is showcased** (item is non-null) — non-projectable
parents still short-circuit to `ref.delete()` before any activity read.

### 3. New trigger — `onActivityWritten` (`activities/{id}`)

- Resolve `(parentType, parentId)` from the after-doc, falling back to the before-doc on a
  delete.
- Standalone activity (`parentId == null`) → return immediately (no showcase exists).
- Re-project the parent: fetch the parent Program/Project doc → `projectShowcase(…)` (passing
  `undefined` when the parent doc is absent so a dangling child cleans up the showcase).
- **Parent-change edge:** when an activity moves parent (before.parentId ≠ after.parentId),
  re-project **both** distinct parents so the old parent does not keep stale photos.
- Projection wrapped in `try/catch` + `console.error` (mirrors the initiative trigger — a
  showcase failure never throws into the awards engine).

### 4. No change required

- **Types** — `ShowcasePhoto` / `ShowcaseItem.photos` shape unchanged.
- **firestore.rules** — beacon uses the Admin SDK (bypasses rules); `showcase` stays
  `read:true, write:false`; activities stay `signedIn`-readable.
- **storage.rules** — no new blob paths.
- **Spotlight** — gallery already renders `item.photos`; cover stays `photos[0]`. The flatten
  is purely server-side → zero frontend edits.

## Data flow

```
activity write ──onActivityWritten──┐
                                    ├─► projectShowcase(parent)
program/project write ──existing────┘     ├─ projectInitiative → item (own photos)
                                          ├─ query activities by parentId
                                          ├─ activityShowcasePhotos (Ejecutada, id-namespaced)
                                          └─ item.photos = own ++ activity ──► showcase/{id}
```

## Testing

- **Unit** (`project-initiative.test.ts`): `activityShowcasePhotos` — Ejecutada-only filter,
  id namespacing, photoless/empty activity, wrong-`parentType` exclusion, caption passthrough.
- **Beacon integration**: `onActivityWritten` re-projects the parent on a photo change;
  parent-change re-projects both parents; standalone activity is a no-op; activity delete
  drops its photos from the showcase.

## Accepted limitations (do not re-flag)

- Photos remain a point-in-time snapshot (refreshed on the next activity/parent write).
- Flattened presentation loses per-activity labeling (deliberate).
- No gallery pagination (pre-existing C4 limit).
- Every activity write now incurs a parent read + activities query + member `getAll`
  (admin-scale write volume — acceptable).
- A non-`Ejecutada` activity's photos never showcase, even if the work happened.
