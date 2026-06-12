# Initiative Galleries Implementation Plan (C1-lite slice 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Photo upload + galleries for initiatives (cover/destacadas) and activities — binary to Storage, metadata in the Firestore `photos[]` array — with `storage.rules` cross-service permission branches, a parent-direction widening of the activity firestore rule, an editable gallery surface, the completed-detail "Galería de actividades", and an optional wizard step 3.

**Architecture:** New `@luminova/firebase` photo-storage helpers generalize the member-photo pattern to `projects|programs|activities/{id}/photos/{photoId}.jpg`. The existing `ImageUploader` (`@luminova/ui`) gains optional `aspect`/`cropShape`/`maxEdge` props (members unchanged). Per-kind repositories gain `addPhoto`/`removePhoto`/`setCover`/`setCaption`; feature-local `useInitiativePhotos`/`useActivityPhotos` hooks orchestrate upload→Storage then array write→Firestore, invalidating the detail + byTerm keys. Feature-local `PhotoGallery` (read) + `PhotoManager` (edit) render the surface; a pure `groupActivityPhotos` helper drives the completed gallery. `storage.rules` reads roles from the auth token and `directionUids` via `firestore.get`; `firestore.rules` widens the activity update path to `Admin ∪ ProjectManager ∪ parent-direction`.

**Tech Stack:** React 19, TanStack Router/Query v5, React Hook Form + Zod (v4.4.3), `@luminova/ui` Sheet/Field/Input/Button/EmptyState/ImageUploader, Firebase Storage + Firestore client, `@firebase/rules-unit-testing` (vitest).

---

## Context the engineer needs

- **`Photo` already exists** — `packages/types/src/engine/initiative.ts`: `{ id: string; url: string; caption: string | null; uploadedAt: Timestamp; uploadedBy: string }`. Shared by `Activity.photos` (`activity.ts`). **`photos[0]` is the cover** (spec). Do not redefine.
- **No `serverTimestamp()` inside arrays.** Firestore rejects the `serverTimestamp()` sentinel inside array elements. `Photo.uploadedAt` for an array element MUST be a concrete client `Timestamp` — use `Timestamp.now()` at add time. `uploadedBy` = the current member id.
- **`InitiativeKind`** = `"Program" | "Project"` (`activity.ts`). **`InitiativeType`** = `"program" | "project"` with maps `KIND` / `INITIATIVE_TYPE` and `initiativeDetailKey(type, id)` in `apps/backstage/src/features/initiatives/hooks/use-initiative.ts`. Collection names are the **lowercase plural**: `Program → "programs"`, `Project → "projects"`.
- **Storage accessor:** `getStorageService()` from `@luminova/firebase` (`packages/firebase/src/index.ts:73`). The member helper pattern is `packages/firebase/src/member-photo.ts` (`ref`/`uploadBytes`/`getDownloadURL`/`deleteObject`; missing-object delete is a no-op). New helpers are re-exported from `index.ts` next to the member ones (`index.ts:77`).
- **`ImageUploader`** (`packages/ui/src/components/image-uploader.tsx`) is currently hardcoded `aspect={1} cropShape="round"` and `cropAndCompress` uses `IMAGE_MAX_EDGE = 512` (`packages/ui/src/lib/image.ts`). Members must keep square/round/512. Add optional props with those exact defaults.
- **Initiative photos need NO firestore.rules change.** `initiativeUpdateAllowed()` already grants `Admin ∪ ProjectManager ∪ isDirection` on `projects`/`programs` update, and `initiativeWriteSafe()` locks only the completion trio (`finalReport`/`status`/`impact`), NOT `photos`. A photos-only write therefore passes in-execution AND on a completed doc (`finalizedRequiresReport` passes because `status` is unchanged or, if `Finalizado`, `finalReport`/`impact` are already non-null; `reportFiledBySelf` passes because the write is not `filingReportNow`).
- **Activity firestore rule DOES change.** `firestore.rules:218` gates activity `create, update` to `Admin ∪ ProjectManager` only. Photo metadata is an activity-doc write, so directors of a parented activity cannot currently write `photos[]`. Widen `update` to add parent-direction (read `parentType`/`parentId` → `firestore.get(parent).directionUids`). **Accepted limitation:** organizers-as-individuals still cannot upload (no per-activity uid mirror) — only parent-direction + Admin/PM. Standalone activities (`parentId == null`) stay Admin/PM-only. Same limitation shape as `directionUids`.
- **Permission gating on the client mirrors the rules.** Detail route (`apps/backstage/src/routes/_app.initiatives_.$type.$id.tsx`) already computes `canUpdate = ability.can("update", kind)` and `isDirection = uid !== null && item.directionUids.includes(uid)`; reuse `(canUpdate || isDirection)` to gate the initiative `PhotoManager`. Auth uid via `useAuth()` (`apps/backstage/src/lib/auth/auth.ts`), current member via `useCurrentMember()` (`apps/backstage/src/features/members/hooks/use-current-member.ts`).
- **photoId** is client-generated: `crypto.randomUUID()` (Node 24 + modern browsers). The Storage helper appends `.jpg`; the array element `id` is the bare uuid.
- **Repos round-trip for array mutations.** `addPhoto` uses `arrayUnion`; `removePhoto`/`setCover`/`setCaption` do read-modify-write (`getById` → recompute `photos[]` → `updateDoc({ photos })`). Admin scale (dozens/term) → no contention concern. Keep `Timestamp` instances intact (do not JSON round-trip).
- **Run rules/storage tests standalone.** `pnpm pr-tests` has an intermittent port race between `@luminova/firestore-rules-tests` and `@luminova/storage-rules-tests` under turbo. Free `:4010` first (`lsof -ti tcp:4010 | xargs kill`), then run the rules packages standalone or `--concurrency=1`.
- **knip/eslint gotchas this epic:** every new `@luminova/ui` export must be consumed or knip fails; use `@luminova/ui <Input>` not raw `<input>` (`no-restricted-syntax`); run `pnpm format` before trusting `turbo run ci` (it caches `ci` and masks prettier/lint drift).

## File map

| File | Responsibility | Action |
|------|----------------|--------|
| `packages/firebase/src/photo-storage.ts` | upload/delete helpers for initiative + activity photo binaries | Create |
| `packages/firebase/src/photo-storage.test.ts` | path-builder unit tests | Create |
| `packages/firebase/src/index.ts` | re-export the new helpers | Modify |
| `storage.rules` | `isPmOrAdmin`, initiative + activity photo branches | Modify |
| `tests/storage-rules/rules.test.ts` | seed initiatives/activities + cover allow/deny | Modify |
| `firestore.rules` | widen activity `update` to parent-direction | Modify |
| `tests/firestore-rules/rules.test.ts` | activity parent-direction branch tests | Modify |
| `packages/ui/src/lib/image.ts` | `cropAndCompress` accepts a `maxEdge` arg | Modify |
| `packages/ui/src/lib/image.test.ts` | `fittedDimensions`/`maxEdge` coverage | Modify |
| `packages/ui/src/components/image-uploader.tsx` | optional `aspect`/`cropShape`/`maxEdge` props | Modify |
| `packages/ui/src/components/image-uploader.test.tsx` | landscape/rect path | Modify |
| `apps/backstage/src/features/programs/repositories/program-repository.ts` | photo array methods | Modify |
| `apps/backstage/src/features/projects/repositories/project-repository.ts` | photo array methods | Modify |
| `apps/backstage/src/features/activities/repositories/activity-repository.ts` | photo array methods | Modify |
| `apps/backstage/src/features/initiatives/repositories/photo-array.ts` | pure `addPhoto`/`removePhoto`/`moveCover`/`setCaption` array transforms | Create |
| `apps/backstage/src/features/initiatives/repositories/photo-array.test.ts` | array-transform unit tests | Create |
| `apps/backstage/src/features/initiatives/hooks/use-initiative-photos.ts` | upload→storage + repo write + invalidate | Create |
| `apps/backstage/src/features/activities/hooks/use-activity-photos.ts` | same for activities | Create |
| `apps/backstage/src/features/initiatives/lib/gallery.ts` | pure `groupActivityPhotos` | Create |
| `apps/backstage/src/features/initiatives/lib/gallery.test.ts` | grouping unit tests | Create |
| `apps/backstage/src/features/initiatives/components/photo-gallery.tsx` | read-only grid + captions + cover badge | Create |
| `apps/backstage/src/features/initiatives/components/photo-manager.tsx` | uploader + add/remove/set-cover/caption | Create |
| `apps/backstage/src/features/initiatives/components/photo-manager.test.tsx` | add/remove/cover interactions | Create |
| `apps/backstage/src/features/initiatives/components/initiative-completed.tsx` | "Galería de actividades" section | Modify |
| `apps/backstage/src/features/initiatives/components/completion-wizard.tsx` | optional step 3 (destacadas + cover) | Modify |
| `apps/backstage/src/features/initiatives/components/completion-wizard.test.tsx` | 3-step nav + submit-empty | Modify |
| `apps/backstage/src/features/activities/components/activity-detail-hero.tsx` (or the slice-4 roll location) | swap read-only roll → `PhotoManager` when editor | Modify |
| `apps/backstage/src/routes/_app.initiatives_.$type.$id.tsx` | wire `PhotoManager` (gated) + pass `type`/`id` to wizard | Modify |

---

## Task 1: Photo-storage helpers (`@luminova/firebase`)

**Files:**
- Create: `packages/firebase/src/photo-storage.ts`
- Test: `packages/firebase/src/photo-storage.test.ts`
- Modify: `packages/firebase/src/index.ts`

- [ ] **Step 1: Write the failing test** — `packages/firebase/src/photo-storage.test.ts` (pure path-builder coverage; do not hit the emulator):

```ts
import { describe, it, expect } from "vitest";
import { initiativePhotoPath, activityPhotoPath } from "./photo-storage";

describe("photo-storage paths", () => {
  it("maps Project to the projects collection", () => {
    expect(initiativePhotoPath("Project", "p1", "abc")).toBe("projects/p1/photos/abc.jpg");
  });
  it("maps Program to the programs collection", () => {
    expect(initiativePhotoPath("Program", "g1", "xyz")).toBe("programs/g1/photos/xyz.jpg");
  });
  it("builds the activity path", () => {
    expect(activityPhotoPath("a1", "def")).toBe("activities/a1/photos/def.jpg");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @luminova/firebase test`
Expected: FAIL — `photo-storage` module not found.

- [ ] **Step 3: Implement** — `packages/firebase/src/photo-storage.ts`:

```ts
import { getDownloadURL, ref, uploadBytes, deleteObject } from "firebase/storage";
import type { InitiativeKind } from "@luminova/types";
import { getStorageService } from "./index";

const KIND_COLLECTION: Record<InitiativeKind, string> = {
  Program: "programs",
  Project: "projects",
};

export function initiativePhotoPath(kind: InitiativeKind, id: string, photoId: string): string {
  return `${KIND_COLLECTION[kind]}/${id}/photos/${photoId}.jpg`;
}

export function activityPhotoPath(activityId: string, photoId: string): string {
  return `activities/${activityId}/photos/${photoId}.jpg`;
}

async function upload(path: string, blob: Blob): Promise<string> {
  const storageRef = ref(getStorageService(), path);
  await uploadBytes(storageRef, blob, { contentType: "image/jpeg" });
  return await getDownloadURL(storageRef);
}

async function remove(path: string): Promise<void> {
  const storageRef = ref(getStorageService(), path);
  try {
    await deleteObject(storageRef);
  } catch (err) {
    if ((err as { code?: string }).code !== "storage/object-not-found") throw err;
  }
}

export function uploadInitiativePhoto(
  kind: InitiativeKind,
  id: string,
  photoId: string,
  blob: Blob,
): Promise<string> {
  return upload(initiativePhotoPath(kind, id, photoId), blob);
}

export function deleteInitiativePhoto(
  kind: InitiativeKind,
  id: string,
  photoId: string,
): Promise<void> {
  return remove(initiativePhotoPath(kind, id, photoId));
}

export function uploadActivityPhoto(
  activityId: string,
  photoId: string,
  blob: Blob,
): Promise<string> {
  return upload(activityPhotoPath(activityId, photoId), blob);
}

export function deleteActivityPhoto(activityId: string, photoId: string): Promise<void> {
  return remove(activityPhotoPath(activityId, photoId));
}
```

- [ ] **Step 4: Re-export** — append to `packages/firebase/src/index.ts` after line 77:

```ts
export {
  initiativePhotoPath,
  activityPhotoPath,
  uploadInitiativePhoto,
  deleteInitiativePhoto,
  uploadActivityPhoto,
  deleteActivityPhoto,
} from "./photo-storage";
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter @luminova/firebase test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/firebase/src/photo-storage.ts packages/firebase/src/photo-storage.test.ts packages/firebase/src/index.ts
git commit -m "feat(firebase): photo-storage helpers for initiatives + activities"
```

---

## Task 2: `storage.rules` — photo branches + tests

**Files:**
- Modify: `storage.rules`
- Test: `tests/storage-rules/rules.test.ts`

- [ ] **Step 1: Write the failing tests** — append to `tests/storage-rules/rules.test.ts`. First extend the `beforeAll` seed (inside the existing `withSecurityRulesDisabled` block, after the `members/m1` doc) to add an initiative + activities:

```ts
    await setDoc(doc(ctx.firestore(), "projects/proj1"), {
      termId: "2026",
      title: "Proyecto Uno",
      directionUids: ["dir-uid"],
    });
    await setDoc(doc(ctx.firestore(), "activities/act_child"), {
      termId: "2026",
      title: "Curso A",
      parentType: "Project",
      parentId: "proj1",
    });
    await setDoc(doc(ctx.firestore(), "activities/act_standalone"), {
      termId: "2026",
      title: "Asamblea",
      parentType: null,
      parentId: null,
    });
```

Then add the describe blocks:

```ts
const PROJ_PHOTO = "projects/proj1/photos/ph1.jpg";
const ACT_CHILD_PHOTO = "activities/act_child/photos/ph1.jpg";
const ACT_STANDALONE_PHOTO = "activities/act_standalone/photos/ph1.jpg";

describe("storage.rules — initiative photos", () => {
  it("allows Admin to write", async () => {
    await assertSucceeds(uploadBytes(ref(storageAs("a", ["Admin"]), PROJ_PHOTO), PHOTO, JPEG));
  });
  it("allows ProjectManager to write", async () => {
    await assertSucceeds(uploadBytes(ref(storageAs("a", ["ProjectManager"]), PROJ_PHOTO), PHOTO, JPEG));
  });
  it("allows the initiative direction to write", async () => {
    await assertSucceeds(uploadBytes(ref(storageAs("dir-uid", ["Member"]), PROJ_PHOTO), PHOTO, JPEG));
  });
  it("denies a non-direction member", async () => {
    await assertFails(uploadBytes(ref(storageAs("stranger", ["Member"]), PROJ_PHOTO), PHOTO, JPEG));
  });
  it("denies anonymous", async () => {
    await assertFails(uploadBytes(ref(storageAnon(), PROJ_PHOTO), PHOTO, JPEG));
  });
  it("denies a non-jpeg even for Admin", async () => {
    await assertFails(
      uploadBytes(ref(storageAs("a", ["Admin"]), PROJ_PHOTO), PHOTO, { contentType: "application/octet-stream" }),
    );
  });
  it("denies oversize even for Admin", async () => {
    await assertFails(
      uploadBytes(ref(storageAs("a", ["Admin"]), PROJ_PHOTO), new Uint8Array(5 * 1024 * 1024 + 1), JPEG),
    );
  });
  it("allows any signed-in user to read", async () => {
    await assertSucceeds(getBytes(ref(storageAs("any", ["Member"]), PROJ_PHOTO)));
  });
});

describe("storage.rules — activity photos", () => {
  it("allows Admin to write a parented activity photo", async () => {
    await assertSucceeds(uploadBytes(ref(storageAs("a", ["Admin"]), ACT_CHILD_PHOTO), PHOTO, JPEG));
  });
  it("allows the parent initiative's direction to write", async () => {
    await assertSucceeds(uploadBytes(ref(storageAs("dir-uid", ["Member"]), ACT_CHILD_PHOTO), PHOTO, JPEG));
  });
  it("denies a non-direction member on a parented activity", async () => {
    await assertFails(uploadBytes(ref(storageAs("stranger", ["Member"]), ACT_CHILD_PHOTO), PHOTO, JPEG));
  });
  it("allows Admin on a standalone activity", async () => {
    await assertSucceeds(uploadBytes(ref(storageAs("a", ["Admin"]), ACT_STANDALONE_PHOTO), PHOTO, JPEG));
  });
  it("denies a member (no parent direction) on a standalone activity", async () => {
    await assertFails(uploadBytes(ref(storageAs("dir-uid", ["Member"]), ACT_STANDALONE_PHOTO), PHOTO, JPEG));
  });
});
```

- [ ] **Step 2: Run to verify they fail** — free `:4010` first:

Run: `lsof -ti tcp:4010 | xargs kill 2>/dev/null; pnpm --filter @luminova/storage-rules-tests test`
Expected: the new allow-cases FAIL (catch-all `{allPaths=**}` denies everything outside `members`).

- [ ] **Step 3: Add the rules** — in `storage.rules`, add helpers inside the `match /b/{bucket}/o` block (next to `isPrivileged`) and the three photo matches before the `{allPaths=**}` catch-all:

```
    function isPmOrAdmin() {
      return request.auth != null
        && request.auth.token.roles is list
        && request.auth.token.roles.hasAny(['Admin', 'ProjectManager']);
    }

    function isInitiativeEditor(coll, id) {
      return isPmOrAdmin()
        || (request.auth != null
            && request.auth.uid in firestore.get(
                 /databases/(default)/documents/$(coll)/$(id)
               ).data.get('directionUids', []));
    }

    // A parented activity inherits its parent initiative's direction. Standalone
    // activities (parentId == null) are Admin/ProjectManager-only — the parentId
    // null-guard short-circuits before the parent get(). Organizers-as-individuals
    // are NOT honored (no per-activity uid mirror) — accepted limitation.
    function activityParentEditor(activityId) {
      let act = firestore.get(/databases/(default)/documents/activities/$(activityId)).data;
      let coll = act.get('parentType', '') == 'Program' ? 'programs' : 'projects';
      return request.auth != null
        && act.get('parentId', null) != null
        && request.auth.uid in firestore.get(
             /databases/(default)/documents/$(coll)/$(act.parentId)
           ).data.get('directionUids', []);
    }

    function isActivityEditor(activityId) {
      return isPmOrAdmin() || activityParentEditor(activityId);
    }

    match /projects/{id}/photos/{photoId} {
      allow read: if request.auth != null;
      allow write: if isInitiativeEditor('projects', id) && isValidPhoto();
    }
    match /programs/{id}/photos/{photoId} {
      allow read: if request.auth != null;
      allow write: if isInitiativeEditor('programs', id) && isValidPhoto();
    }
    match /activities/{id}/photos/{photoId} {
      allow read: if request.auth != null;
      allow write: if isActivityEditor(id) && isValidPhoto();
    }
```

- [ ] **Step 4: Run to verify they pass**

Run: `lsof -ti tcp:4010 | xargs kill 2>/dev/null; pnpm --filter @luminova/storage-rules-tests test`
Expected: PASS (all member + new initiative + activity cases).

- [ ] **Step 5: Commit**

```bash
git add storage.rules tests/storage-rules/rules.test.ts
git commit -m "feat(storage): photo-path rules for initiatives + activities"
```

---

## Task 3: `firestore.rules` — activity update parent-direction

**Files:**
- Modify: `firestore.rules`
- Test: `tests/firestore-rules/rules.test.ts`

- [ ] **Step 1: Write the failing tests** — in `tests/firestore-rules/rules.test.ts`, ensure the fixture seed has a parented activity whose parent project carries `directionUids: ["owner-uid"]` (reuse the existing `projects/p_dir` direction fixture; add an `activities/act_dir` doc with `parentType: "Project", parentId: "p_dir"`). Then add:

```ts
  it("lets the parent initiative's direction add photos to a parented activity", async () => {
    await assertSucceeds(
      updateDoc(doc(as("owner-uid", ["Member"]), "activities/act_dir"), {
        photos: [
          { id: "ph1", url: "https://x/ph1.jpg", caption: null,
            uploadedAt: new Date("2026-06-12T00:00:00Z"), uploadedBy: "m_owner" },
        ],
      }),
    );
  });
  it("still lets Admin update an activity", async () => {
    await assertSucceeds(
      updateDoc(doc(as("u", ["Admin"]), "activities/act_dir"), { title: "Renombrada" }),
    );
  });
  it("denies a non-direction member updating an activity", async () => {
    await assertFails(
      updateDoc(doc(as("stranger", ["Member"]), "activities/act_dir"), { title: "Hack" }),
    );
  });
  it("denies a member on a standalone activity (no parent direction)", async () => {
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "activities/act_standalone"), { title: "X" }),
    );
  });
```

(Seed `activities/act_standalone` with `parentType: null, parentId: null` if not present.)

- [ ] **Step 2: Run to verify they fail** — free `:4010` first:

Run: `lsof -ti tcp:4010 | xargs kill 2>/dev/null; pnpm --filter @luminova/firestore-rules-tests test`
Expected: the direction allow-case FAILS (activity update is Admin/PM-only today).

- [ ] **Step 3: Add the rule** — in `firestore.rules`, add a helper near `isDirection()` (~35) and rewrite the activity match (218):

```
    // A parented activity inherits its parent initiative's direction. Standalone
    // activities (parentId == null) stay Admin/ProjectManager-only. Organizers-as-
    // individuals are not honored (rules can't iterate the array; no uid mirror).
    function activityParentDirection() {
      let coll = resource.data.get('parentType', '') == 'Program' ? 'programs' : 'projects';
      return signedIn()
        && resource.data.get('parentId', null) != null
        && request.auth.uid in get(
             /databases/$(database)/documents/$(coll)/$(resource.data.parentId)
           ).data.get('directionUids', []);
    }
```

```
    match /activities/{activityId} {
      allow read: if signedIn();
      allow create: if hasAnyRole(['Admin', 'ProjectManager']);
      allow update: if hasAnyRole(['Admin', 'ProjectManager']) || activityParentDirection();
      allow delete: if false;
    }
```

- [ ] **Step 4: Run to verify they pass**

Run: `lsof -ti tcp:4010 | xargs kill 2>/dev/null; pnpm --filter @luminova/firestore-rules-tests test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules tests/firestore-rules/rules.test.ts
git commit -m "feat(firestore): activity update widens to parent-initiative direction"
```

---

## Task 4: `ImageUploader` — landscape/aspect/maxEdge props

**Files:**
- Modify: `packages/ui/src/lib/image.ts`, `packages/ui/src/lib/image.test.ts`
- Modify: `packages/ui/src/components/image-uploader.tsx`, `packages/ui/src/components/image-uploader.test.tsx`

- [ ] **Step 1: Write the failing test** — add to `packages/ui/src/lib/image.test.ts`:

```ts
import { fittedDimensions } from "./image";
// ...
it("fits to a custom max edge", () => {
  expect(fittedDimensions(3200, 2400, 1600)).toEqual({ width: 1600, height: 1200 });
});
it("leaves smaller images untouched", () => {
  expect(fittedDimensions(800, 600, 1600)).toEqual({ width: 800, height: 600 });
});
```

`fittedDimensions` already takes `maxEdge` — these should pass once `cropAndCompress` threads a caller-supplied edge. Add the failing piece on the component side (Step 2).

- [ ] **Step 2: Thread `maxEdge` through `cropAndCompress`** — `packages/ui/src/lib/image.ts`:

```ts
export async function cropAndCompress(
  imageSrc: string,
  crop: CropRect,
  maxEdge: number = IMAGE_MAX_EDGE,
): Promise<Blob> {
  const img = await loadImage(imageSrc);
  const out = fittedDimensions(crop.width, crop.height, maxEdge);
  // ...unchanged below
}
```

- [ ] **Step 3: Add props to `ImageUploader`** — `packages/ui/src/components/image-uploader.tsx`. Extend the interface and plumb through; keep defaults that preserve member behavior:

```ts
interface ImageUploaderProps {
  currentSrc: string | null | undefined;
  name: string;
  onUpload: (blob: Blob) => Promise<void>;
  onRemove: () => Promise<void>;
  disabled?: boolean;
  aspect?: number;          // default 1
  cropShape?: "round" | "rect"; // default "round"
  maxEdge?: number;         // default 512 (IMAGE_MAX_EDGE)
}
```

In the component signature default them (`aspect = 1, cropShape = "round", maxEdge = 512`); pass `aspect={aspect} cropShape={cropShape}` to `<Cropper>` and call `cropAndCompress(src, areaPixels, maxEdge)` in `confirmCrop`. When `cropShape === "rect"` the preview container should drop the round mask (it already uses `rounded-card`). The `<Avatar>` preview is fine for square; for landscape callers will pass their own `currentSrc` thumbnail — leave the `Avatar` as the picker affordance (acceptable; the manager renders the real gallery).

- [ ] **Step 4: Test the landscape path** — add to `packages/ui/src/components/image-uploader.test.tsx` a render asserting the component mounts with `aspect={3 / 2} cropShape="rect" maxEdge={1600}` and the file input is present (mirror the existing member test).

- [ ] **Step 5: Run to verify**

Run: `pnpm --filter @luminova/ui test`
Expected: PASS (member round/512 unchanged; landscape path covered).

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/lib/image.ts packages/ui/src/lib/image.test.ts packages/ui/src/components/image-uploader.tsx packages/ui/src/components/image-uploader.test.tsx
git commit -m "feat(ui): ImageUploader aspect/cropShape/maxEdge props (landscape support)"
```

---

## Task 5: Pure photo-array transforms

**Files:**
- Create: `apps/backstage/src/features/initiatives/repositories/photo-array.ts`
- Test: `apps/backstage/src/features/initiatives/repositories/photo-array.test.ts`

- [ ] **Step 1: Write the failing test**:

```ts
import { describe, it, expect } from "vitest";
import type { Photo } from "@luminova/types";
import { removePhoto, moveCover, setCaption } from "./photo-array";

const ts = { toMillis: () => 0 } as Photo["uploadedAt"];
const make = (id: string): Photo => ({ id, url: `u/${id}`, caption: null, uploadedAt: ts, uploadedBy: "m" });

describe("photo-array transforms", () => {
  it("removes by id", () => {
    expect(removePhoto([make("a"), make("b")], "a").map((p) => p.id)).toEqual(["b"]);
  });
  it("moves the cover to index 0 preserving order of the rest", () => {
    expect(moveCover([make("a"), make("b"), make("c")], "c").map((p) => p.id)).toEqual(["c", "a", "b"]);
  });
  it("is a no-op when the cover id is unknown", () => {
    expect(moveCover([make("a"), make("b")], "z").map((p) => p.id)).toEqual(["a", "b"]);
  });
  it("sets a caption by id", () => {
    expect(setCaption([make("a")], "a", "Hola")[0].caption).toBe("Hola");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter backstage test -- photo-array`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `photo-array.ts`:

```ts
import type { Photo } from "@luminova/types";

export function removePhoto(photos: Photo[], photoId: string): Photo[] {
  return photos.filter((p) => p.id !== photoId);
}

export function moveCover(photos: Photo[], photoId: string): Photo[] {
  const target = photos.find((p) => p.id === photoId);
  if (!target) return photos;
  return [target, ...photos.filter((p) => p.id !== photoId)];
}

export function setCaption(photos: Photo[], photoId: string, caption: string): Photo[] {
  const trimmed = caption.trim();
  return photos.map((p) => (p.id === photoId ? { ...p, caption: trimmed === "" ? null : trimmed } : p));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter backstage test -- photo-array`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/features/initiatives/repositories/photo-array.ts apps/backstage/src/features/initiatives/repositories/photo-array.test.ts
git commit -m "feat(backstage): pure photo-array transforms"
```

---

## Task 6: Repository photo methods (program / project / activity)

**Files:**
- Modify: `apps/backstage/src/features/programs/repositories/program-repository.ts`
- Modify: `apps/backstage/src/features/projects/repositories/project-repository.ts`
- Modify: `apps/backstage/src/features/activities/repositories/activity-repository.ts`

- [ ] **Step 1: Add methods to `ProjectRepository`** (mirror verbatim in `ProgramRepository`). Import `arrayUnion` and the transforms; add:

```ts
import { arrayUnion } from "firebase/firestore";
import type { Photo } from "@luminova/types";
import { removePhoto as dropPhoto, moveCover, setCaption as relabel } from "../../initiatives/repositories/photo-array";

  async addPhoto(id: string, photo: Photo): Promise<void> {
    await updateDoc(doc(this.collection, id), { photos: arrayUnion(photo) });
  }
  async removePhoto(id: string, photoId: string): Promise<void> {
    const row = await this.getById(id);
    if (!row) throw new Error("Iniciativa no encontrada.");
    await updateDoc(doc(this.collection, id), { photos: dropPhoto(row.photos, photoId) });
  }
  async setCover(id: string, photoId: string): Promise<void> {
    const row = await this.getById(id);
    if (!row) throw new Error("Iniciativa no encontrada.");
    await updateDoc(doc(this.collection, id), { photos: moveCover(row.photos, photoId) });
  }
  async setCaption(id: string, photoId: string, caption: string): Promise<void> {
    const row = await this.getById(id);
    if (!row) throw new Error("Iniciativa no encontrada.");
    await updateDoc(doc(this.collection, id), { photos: relabel(row.photos, photoId, caption) });
  }
```

- [ ] **Step 2: Add the same four methods to `ActivityRepository`** (uses its own `this.collection`, error text `"Actividad no encontrada."`, imports from `../../initiatives/repositories/photo-array`).

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter backstage typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/backstage/src/features/programs/repositories/program-repository.ts apps/backstage/src/features/projects/repositories/project-repository.ts apps/backstage/src/features/activities/repositories/activity-repository.ts
git commit -m "feat(backstage): repository photo array methods"
```

---

## Task 7: Photo hooks (initiative + activity)

**Files:**
- Create: `apps/backstage/src/features/initiatives/hooks/use-initiative-photos.ts`
- Create: `apps/backstage/src/features/activities/hooks/use-activity-photos.ts`

- [ ] **Step 1: Implement `useInitiativePhotos`**:

```ts
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Timestamp } from "firebase/firestore";
import {
  uploadInitiativePhoto,
  deleteInitiativePhoto,
} from "@luminova/firebase";
import type { Photo } from "@luminova/types";
import { ProgramRepository } from "../../programs/repositories/program-repository";
import { ProjectRepository } from "../../projects/repositories/project-repository";
import { programKeys } from "../../programs/hooks/program-keys";
import { projectKeys } from "../../projects/hooks/project-keys";
import { useCurrentMember } from "../../members/hooks/use-current-member";
import { KIND, initiativeDetailKey, type InitiativeType } from "./use-initiative";

export function useInitiativePhotos(type: InitiativeType, id: string, termId: string) {
  const qc = useQueryClient();
  const { data: member } = useCurrentMember();
  const repo = type === "program" ? new ProgramRepository() : new ProjectRepository();
  const kind = KIND[type];

  const invalidate = useCallback(async () => {
    await qc.invalidateQueries({
      queryKey: type === "program" ? programKeys.byTerm(termId) : projectKeys.byTerm(termId),
    });
    await qc.invalidateQueries({ queryKey: initiativeDetailKey(type, id) });
  }, [qc, type, termId, id]);

  const addPhoto = useCallback(
    async (blob: Blob, caption: string | null = null) => {
      const photoId = crypto.randomUUID();
      const url = await uploadInitiativePhoto(kind, id, photoId, blob);
      const photo: Photo = {
        id: photoId,
        url,
        caption,
        uploadedAt: Timestamp.now(),
        uploadedBy: member?.id ?? "",
      };
      await repo.addPhoto(id, photo);
      await invalidate();
    },
    [kind, id, member?.id, repo, invalidate],
  );

  const removePhotoById = useCallback(
    async (photoId: string) => {
      await repo.removePhoto(id, photoId);
      await deleteInitiativePhoto(kind, id, photoId).catch((err) =>
        console.warn("orphan initiative photo", id, photoId, err),
      );
      await invalidate();
    },
    [kind, id, repo, invalidate],
  );

  const setCover = useCallback(
    async (photoId: string) => {
      await repo.setCover(id, photoId);
      await invalidate();
    },
    [id, repo, invalidate],
  );

  const setCaption = useCallback(
    async (photoId: string, caption: string) => {
      await repo.setCaption(id, photoId, caption);
      await invalidate();
    },
    [id, repo, invalidate],
  );

  return { addPhoto, removePhotoById, setCover, setCaption };
}
```

- [ ] **Step 2: Implement `useActivityPhotos`** — same shape against `ActivityRepository`, `uploadActivityPhoto`/`deleteActivityPhoto`, invalidating the activity detail key + `useActivitiesByTerm` key (grep `activityKeys`/the query key used by `use-activity.ts` and `use-activities-by-term.ts`; reuse those). No `kind`.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter backstage typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/backstage/src/features/initiatives/hooks/use-initiative-photos.ts apps/backstage/src/features/activities/hooks/use-activity-photos.ts
git commit -m "feat(backstage): photo upload hooks (initiative + activity)"
```

---

## Task 8: `groupActivityPhotos` (pure gallery grouping)

**Files:**
- Create: `apps/backstage/src/features/initiatives/lib/gallery.ts`
- Test: `apps/backstage/src/features/initiatives/lib/gallery.test.ts`

- [ ] **Step 1: Write the failing test**:

```ts
import { describe, it, expect } from "vitest";
import type { Activity, Photo } from "@luminova/types";
import { groupActivityPhotos } from "./gallery";

const at = (ms: number) => ({ toMillis: () => ms }) as Activity["startAt"];
const photo = (id: string): Photo =>
  ({ id, url: `u/${id}`, caption: null, uploadedAt: at(0), uploadedBy: "m" }) as Photo;
const act = (id: string, startMs: number, photos: Photo[]): Activity =>
  ({ id, title: `A-${id}`, startAt: at(startMs), photos } as unknown as Activity);

describe("groupActivityPhotos", () => {
  it("keeps only activities that have photos, oldest-start first", () => {
    const groups = groupActivityPhotos([
      act("b", 200, [photo("p2")]),
      act("a", 100, [photo("p1")]),
      act("c", 300, []),
    ]);
    expect(groups.map((g) => g.activityId)).toEqual(["a", "b"]);
    expect(groups[0].title).toBe("A-a");
    expect(groups[0].photos.map((p) => p.id)).toEqual(["p1"]);
  });
  it("returns [] when nothing has photos", () => {
    expect(groupActivityPhotos([act("a", 1, [])])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter backstage test -- gallery`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `gallery.ts`:

```ts
import type { Activity, Photo } from "@luminova/types";

export interface ActivityPhotoGroup {
  activityId: string;
  title: string;
  photos: Photo[];
}

export function groupActivityPhotos(activities: Activity[]): ActivityPhotoGroup[] {
  return activities
    .filter((a) => a.photos.length > 0)
    .sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis())
    .map((a) => ({ activityId: a.id, title: a.title, photos: a.photos }));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter backstage test -- gallery`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/features/initiatives/lib/gallery.ts apps/backstage/src/features/initiatives/lib/gallery.test.ts
git commit -m "feat(backstage): groupActivityPhotos gallery helper"
```

---

## Task 9: `PhotoGallery` (read-only) + `PhotoManager` (edit) components

**Files:**
- Create: `apps/backstage/src/features/initiatives/components/photo-gallery.tsx`
- Create: `apps/backstage/src/features/initiatives/components/photo-manager.tsx`
- Test: `apps/backstage/src/features/initiatives/components/photo-manager.test.tsx`

- [ ] **Step 1: Implement `PhotoGallery`** — pure presentational, feature-local. Props: `{ photos: Photo[]; showCover?: boolean }`. Render a responsive grid (`grid gap-3 sm:grid-cols-2 lg:grid-cols-3`); each cell is a fixed `aspect-[3/2] rounded-card overflow-hidden border border-line` figure with `<img src={p.url} alt={p.caption ?? "Foto"} loading="lazy" className="h-full w-full object-cover" />` and a caption `<figcaption className="mt-1 text-[13px] text-ink-2">`. When `showCover`, mark `photos[0]` with a `Badge`-style pill (star icon + "Portada", `bg-jci-yellow/22 text-ink-1`). Empty → `EmptyState` ("Sin fotos todavía"). Respect `motion-reduce` on any hover transition.

- [ ] **Step 2: Implement `PhotoManager`** — props:

```ts
interface PhotoManagerProps {
  photos: Photo[];
  onUpload: (blob: Blob) => Promise<void>;
  onRemove: (photoId: string) => Promise<void>;
  onSetCover: (photoId: string) => Promise<void>;
  onSetCaption: (photoId: string, caption: string) => Promise<void>;
  disabled?: boolean;
}
```

Top: `<ImageUploader currentSrc={null} name="Foto" aspect={3 / 2} cropShape="rect" maxEdge={1600} onUpload={onUpload} onRemove={async () => {}} disabled={disabled} />` (the uploader is add-only here; per-photo removal lives on the thumbnails). Below: the same grid as `PhotoGallery`, each thumbnail with three icon-only buttons (`aria-label` each, ≥44px hit area, visible focus ring): set-cover (★, hidden for `photos[0]`), edit-caption (inline `@luminova/ui` `<Input>` toggled open, blur/Enter commits `onSetCaption`), remove (×, `text-error`). **Remove confirms** before calling `onRemove` (a small inline "¿Quitar?" confirm row or a window-free confirm pattern already used in the activities cancel flow — grep for the cancel confirmation and reuse it). Cover pill on `photos[0]`.

- [ ] **Step 3: Write component tests** — `photo-manager.test.tsx`: (a) renders one figure per photo; (b) clicking set-cover on a non-cover photo calls `onSetCover` with its id; (c) the cover photo shows the "Portada" pill and no set-cover button; (d) remove triggers the confirm then `onRemove`. Mock the handlers with `vi.fn()`. Mirror the render harness used by `completion-wizard.test.tsx`.

- [ ] **Step 4: Run**

Run: `pnpm --filter backstage test -- photo-manager`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/features/initiatives/components/photo-gallery.tsx apps/backstage/src/features/initiatives/components/photo-manager.tsx apps/backstage/src/features/initiatives/components/photo-manager.test.tsx
git commit -m "feat(backstage): PhotoGallery + PhotoManager components"
```

---

## Task 10: Wire initiative gallery into the detail route + completed view

**Files:**
- Modify: `apps/backstage/src/routes/_app.initiatives_.$type.$id.tsx`
- Modify: `apps/backstage/src/features/initiatives/components/initiative-completed.tsx`

- [ ] **Step 1: Detail route — destacadas manager** — in `_app.initiatives_.$type.$id.tsx`, instantiate `const photos = useInitiativePhotos(type, id, item.termId);` and render, gated by `(canUpdate || isDirection)`, a "Destacadas" section using `PhotoManager` (`photos={item.photos}` and the four handlers from the hook). For non-editors render the read-only `PhotoGallery` with `showCover`. Place it in the Resumen tab below the existing summary; on the completed view it is superseded by Step 2's gallery (keep the destacadas manager available to editors so they can curate after completion — `photos[]` writes are unlocked on completed docs).

- [ ] **Step 2: Completed "Galería de actividades"** — `initiative-completed.tsx` currently receives the initiative. Add an `activities: Activity[]` prop (the detail route already loads child activities via `useActivitiesByTerm` + `childActivitiesOf`; pass them through). Render:
  - Initiative destacadas: `<PhotoGallery photos={item.photos} showCover />` under a "Destacadas" heading (omit if empty).
  - `groupActivityPhotos(activities)` → for each group a section: small-caps eyebrow (`group.title`) then `<PhotoGallery photos={group.photos} />`.
  - If both are empty, an `EmptyState` ("Aún no hay fotos de actividades").

- [ ] **Step 3: Typecheck + targeted tests**

Run: `pnpm --filter backstage typecheck && pnpm --filter backstage test -- initiative`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/backstage/src/routes/_app.initiatives_.\$type.\$id.tsx apps/backstage/src/features/initiatives/components/initiative-completed.tsx
git commit -m "feat(backstage): initiative destacadas manager + completed activity gallery"
```

---

## Task 11: Editable activity photo roll

**Files:**
- Modify: `apps/backstage/src/features/activities/components/activity-detail-hero.tsx` (or the slice-4 read-only roll component — grep `photos` under `features/activities/components` to confirm)
- Modify: `apps/backstage/src/routes/_app.activities_.$id.tsx`

- [ ] **Step 1: Locate the slice-4 read-only roll** — grep:

```bash
grep -rn "photos" apps/backstage/src/features/activities apps/backstage/src/routes/_app.activities_.\$id.tsx
```

- [ ] **Step 2: Compute the editor flag in the route** — in `_app.activities_.$id.tsx`, the activity has `parentType`/`parentId`. The editor set mirrors the new firestore rule: `Admin/ProjectManager` (CASL `ability.can("update", "Activity")`) OR the parent initiative's direction. Loading the parent's `directionUids` client-side requires the parent doc; if it is not already in cache, gate the manager on `ability.can("update", "Activity")` only and let direction-based editing surface via the rules (the write still succeeds for direction; the manager just shows to Admin/PM in the UI). Document this as an accepted UI/rule asymmetry (same shape as the initiative `isDirection` client mirror, which DOES have `directionUids` on the loaded doc — activities do not carry the parent's uids). Prefer: fetch the parent initiative via `useInitiative(INITIATIVE_TYPE[parentType], parentId, { enabled: parentId !== null })` and compute `isParentDirection = uid && parent?.directionUids.includes(uid)`.

- [ ] **Step 3: Swap the roll** — when editor, render `PhotoManager` wired to `useActivityPhotos(activityId, termId)`; otherwise the read-only `PhotoGallery`. Reuse the same components from Task 9.

- [ ] **Step 4: Typecheck + tests**

Run: `pnpm --filter backstage typecheck && pnpm --filter backstage test -- activity`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/features/activities apps/backstage/src/routes/_app.activities_.\$id.tsx
git commit -m "feat(backstage): editable activity photo roll"
```

---

## Task 12: Completion wizard step 3 (optional destacadas)

**Files:**
- Modify: `apps/backstage/src/features/initiatives/components/completion-wizard.tsx`
- Modify: `apps/backstage/src/features/initiatives/components/completion-wizard.test.tsx`
- Modify: `apps/backstage/src/routes/_app.initiatives_.$type.$id.tsx` (pass `type`/`id`/`termId` + current `photos`)

- [ ] **Step 1: Extend wizard props + steps** — change `useState<1 | 2>(1)` → `useState<1 | 2 | 3>(1)`, "Paso {step} de 3", and add props:

```ts
interface CompletionWizardProps {
  initiativeLabel: string;
  isSaving: boolean;
  onComplete: (impact: InitiativeImpactInput) => void;
  photos: Photo[];
  onUploadPhoto: (blob: Blob) => Promise<void>;
  onRemovePhoto: (photoId: string) => Promise<void>;
  onSetCover: (photoId: string) => Promise<void>;
  onSetCaption: (photoId: string, caption: string) => Promise<void>;
}
```

Step 2's footer "Finalizar" button becomes a "Siguiente →" that advances to step 3 (no validation gate — impact fields still validate on the final submit via `handleSubmit`; keep `trigger(["personsImpacted","volunteers"])` before advancing so invalid numbers are caught at step 2). Step 3 renders a "Destacadas (opcional)" heading + `<PhotoManager photos={photos} onUpload={onUploadPhoto} onRemove={onRemovePhoto} onSetCover={onSetCover} onSetCaption={onSetCaption} />`, a "← Atrás" button (to step 2), and the `type="submit"` "Finalizar {label}" button — **always enabled** (zero photos is valid). Photo writes in step 3 are live (the initiative already exists); they are independent of the trio submit.

- [ ] **Step 2: Update wizard tests** — `completion-wizard.test.tsx`: add a test that navigates 1→2→3 and submits with zero photos (asserts `onComplete` called); keep the existing step-1/2 validation tests. Pass `vi.fn()` for the four photo handlers and `photos={[]}`.

- [ ] **Step 3: Wire the route** — where the route renders `<CompletionWizard …>`, pass `photos={item.photos}` and the four handlers from `useInitiativePhotos(type, id, item.termId)` (already instantiated in Task 10 Step 1).

- [ ] **Step 4: Run**

Run: `pnpm --filter backstage test -- completion-wizard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/features/initiatives/components/completion-wizard.tsx apps/backstage/src/features/initiatives/components/completion-wizard.test.tsx apps/backstage/src/routes/_app.initiatives_.\$type.\$id.tsx
git commit -m "feat(backstage): completion wizard step 3 (optional destacadas)"
```

---

## Task 13: Verification gauntlet (before PR)

- [ ] **Step 1: Format first** (turbo caches `ci` and masks prettier drift):

```bash
pnpm format
```

- [ ] **Step 2: Full local CI** — free `:4010` first:

```bash
lsof -ti tcp:4010 | xargs kill 2>/dev/null
pnpm pr-tests
```

Expected: backstage CI (prettier/eslint/tsc/build/vitest/knip/size-limit), `@luminova/ui`, `@luminova/firebase`, `@luminova/types`, firestore-rules, storage-rules, seed — all green. If the rules/storage port race trips, re-run those two standalone (`pnpm --filter @luminova/storage-rules-tests test`, `pnpm --filter @luminova/firestore-rules-tests test`).

- [ ] **Step 3: knip / bundle** — confirm no unused exports (every `@luminova/firebase`/`@luminova/ui` export added is consumed) and dispatch `bundle-budget-watcher` (new components are feature-local; `react-easy-crop` already lazy via `ImageUploader`).

- [ ] **Step 4: Reviews (storage.rules touched → mandatory):**
  - `/security-review` on the branch diff.
  - `firestore-security-reviewer` subagent (covers `firestore.get` reads from `storage.rules` + the activity parent-direction widening + the repository photo writes).
  - `/simplify` on the diff, then `/code-review` (high).
  - `react-best-practices` already auto-applies on the `.tsx` edits.

- [ ] **Step 5: Manual emulator click-through** (standing pre-prod item this epic — record the checklist on the PR): upload a destacada to an in-execution project as a director; set cover; edit caption; remove (confirm); upload an activity photo as parent-direction; verify a non-direction member is blocked; complete via the wizard with and without step-3 photos; confirm the completed "Galería de actividades" groups child photos by activity.

---

## Self-review notes (spec coverage)

- **Storage paths + rules + tests** → Tasks 1–2. **Cross-service `firestore.get` direction read** → Task 2 (initiative) + activity parent lookup; mirrored firestore widening → Task 3.
- **Reuse H1 `ImageUploader` + `@luminova/firebase` helpers** → Tasks 1, 4 (no new crop/upload infra).
- **Wizard step 3 optional, submittable empty** → Task 12.
- **Gallery UI: child-activity photos grouped + captioned by activity + initiative destacadas; slice-4 read-only roll → editable** → Tasks 8–11.
- **`PhotoGallery` feature-local** (decision) → Task 9 (not promoted to `@luminova/ui`).
- **Photo type reuse, `directionUids` read-not-mirrored, Zod v4** → honored in Context.
- **Accepted limitations:** organizers-as-individuals can't upload activity photos (only parent-direction + Admin/PM) until a per-activity uid mirror exists; standalone-activity photos stay Admin/PM-only; activity editor UI may show only to Admin/PM unless the parent initiative is loaded for its `directionUids` (Task 11 Step 2).
