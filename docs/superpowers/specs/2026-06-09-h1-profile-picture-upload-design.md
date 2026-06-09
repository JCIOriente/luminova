# H1 — profilePicture upload (design)

**Date:** 2026-06-09
**Track:** H1 (roadmap.md → "H. Media / Storage")
**Status:** approved, ready for plan
**Dep:** none (Storage client + emulator already wired)
**Parallel-safe with:** B2 (zero file overlap)
**Security:** touches `storage.rules` → `/security-review` + `firestore-security-reviewer` required.

## Problem

`Member.profilePicture` is always `null`. There's no way to set a member photo —
no uploader, no Avatar display, no Storage path convention enforced. `@luminova/ui`
has no `Avatar` component; the member form/drawer renders generated initials only.

## Goal

Ship a **shared profile-picture uploader** used on **two surfaces**:

1. **Admin** — in the backstage member form/drawer, Membership/Admin sets any
   member's photo (including un-provisioned members with no `uid` yet).
2. **Member self** — on `/me`, a member sets their own photo only.

Build the uploader **once** (in `@luminova/ui`), wire two entry points. Includes a
**square-crop UI** before upload, client-side downscale + compress, and a tightened
Storage rule.

## Storage model

### Path (keyed by memberId)

```
members/{memberId}/profile.<ext>
```

Keyed by **memberId** (Firestore doc id), not `uid`, so admins can upload for
un-provisioned members (no uid yet). Fixed filename → new upload **overwrites** the
old object (no orphans). Store the resulting download URL in
`members/{memberId}.profilePicture`.

### Storage rule (`storage.rules`)

Replace the current blanket `/members/{allPaths} allow read,write: if request.auth != null`
with a scoped rule:

```
match /members/{memberId}/{file} {
  allow read: if request.auth != null;
  allow write: if request.auth != null && (
    isPrivileged() ||
    firestore.get(/databases/(default)/documents/members/$(memberId)).data.uid == request.auth.uid
  );
}
```

- `isPrivileged()` = role claim in `{Admin, Membership}` (read from
  `request.auth.token` custom claims — confirm claim shape during impl;
  `claims.roles` is an array).
- Self-write branch uses `firestore.get` to map memberId → owner uid (one read per
  write — acceptable).
- All other paths remain `allow read,write: if false`.

Add Storage emulator rules tests covering: privileged writes any member; owner
writes own; non-owner member blocked; unauthenticated blocked; read requires auth.

## Components / files

### `@luminova/ui` (new components)

- `src/components/avatar.tsx` — `Avatar` (photo with initials fallback). Props:
  `src?: string | null`, `name: string`, `size?`, tint seed for fallback bg.
  Barrel-exported. Replaces ad-hoc initials in member-drawer/form.
- `src/components/image-uploader.tsx` — `ImageUploader`. Responsibilities:
  file picker (`accept="image/*"`), **square-crop UI** (crop + zoom), client
  downscale to **512px max edge**, compress (JPEG/WebP ~0.8, cap 5MB), emit the
  processed `Blob`. Pure-ish: takes `onUpload(blob) => Promise<void>`, owns no
  Firebase. Remove-photo affordance.
- Pure helpers (testable): `src/lib/image.ts` — `validateImage(file)`,
  `downscaleToBlob(source, maxEdge, quality)`, crop-rect math.

### New dependency (crop lib)

Square-crop needs one crop library. **`secure-dep-vetting` runs before adding it**
(latest secure version, Node 24 compat, CVE check, caret-pinned). Candidate:
`react-easy-crop` — agent must vet, not assume. Added to `packages/ui`.

### `@luminova/firebase`

- Export a `storage` accessor (currently `getStorage` is init'd inside
  `getFirebase()` but not surfaced). Add `getStorageService()` or export
  `storage` via the services object accessor — match existing export style.
- Add a thin upload helper (or keep upload in app layer — decide in plan):
  `uploadMemberPhoto(memberId, blob) => Promise<downloadUrl>` using
  `ref(storage, members/{memberId}/profile.<ext>)` + `uploadBytes` +
  `getDownloadURL`. Plus `deleteMemberPhoto(memberId)`.

### `@luminova/types`

- Allow updating `profilePicture` on the member update path. Today
  `MemberInput` omits it and the mapper drops it on update. Keep the main form
  Zod schema unchanged — **the photo is its own action**, not a form field — but
  the member-repository update must accept a `profilePicture` write (and `null`
  for removal). Add a narrow repo method rather than widening `MemberInput`.

### `apps/backstage`

- Member form/drawer: embed `ImageUploader` + `Avatar` preview; on upload →
  `uploadMemberPhoto` → repo writes `profilePicture`; on remove → delete + null.
  Decoupled from the Zod submit (upload is immediate, not on Save).
- `/me`: add the same uploader scoped to the member's own record (memberId from
  their member doc). Reuses the shared component + helper.

## Upload action flow (shared, both surfaces)

```
pick file → validate(type,size) → crop UI → downscale+compress to Blob
  → uploadMemberPhoto(memberId, blob) → downloadUrl
  → memberRepo.setProfilePicture(memberId, downloadUrl)
  → Avatar updates (query invalidation)
remove → deleteMemberPhoto(memberId) → memberRepo.setProfilePicture(memberId, null)
```

## Error handling

- Wrong type / oversize → rejected pre-upload, inline message, no Storage call.
- Upload failure → toast, keep existing photo (no field write).
- Remove: null the field even if object delete fails; log the orphan (don't block
  the user).
- Self-upload by a member whose doc has no `uid` → shouldn't happen (only
  provisioned members reach `/me`); rule denies anyway.

## Testing

- Unit (Vitest): `validateImage`, `downscaleToBlob` (dimension/quality math),
  crop-rect math.
- Storage rules tests (emulator): privileged-any, owner-own, non-owner-blocked,
  unauth-blocked, read-requires-auth.
- Component smoke: `Avatar` fallback vs photo; `ImageUploader` rejects bad file.

## Skill/review checklist

- `secure-dep-vetting` — **before** adding the crop lib (blocking).
- `react-best-practices` (auto on `.tsx`).
- `/security-review` — on the `storage.rules` diff + upload path (REQUIRED).
- `firestore-security-reviewer` — rules vs access alignment.
- `bundle-budget-watcher` — crop lib adds weight; check budget.
- `superpowers:test-driven-development` — helpers + rules tests first.

## Out of scope / follow-ups

- H2 (project evidence gallery — blocked on C1), H3 (ally logos — chains off this
  uploader), H4 (spotlight real images). The shared `ImageUploader` is designed so
  H3 reuses it with an `allies/{id}/logo.<ext>` path.
- Multiple photos / galleries.
- CDN / image-resize extension (server-side).
