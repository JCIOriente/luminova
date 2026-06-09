# H1 profilePicture Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shared profile-picture uploader (crop + downscale + compress) usable by admins (any member, in the member form) and by members themselves (own record, on `/me`), persisting to Firebase Storage at `members/{memberId}/profile.<ext>` and writing the URL to `members/{memberId}.profilePicture`.

**Architecture:** Pure image helpers + two `@luminova/ui` components (`Avatar`, `ImageUploader`) with no Firebase coupling. `@luminova/firebase` exports a `storage` accessor + `uploadMemberPhoto` / `deleteMemberPhoto`. A repo method `setProfilePicture` is the only Firestore write. The photo is its **own action**, decoupled from the member form's Zod submit. `storage.rules` is tightened so members write only their own folder; privileged roles write any.

**Tech Stack:** React 19, TypeScript strict, Firebase Storage (modular SDK), `react-easy-crop` (crop — VET FIRST), Vitest, Firebase emulator (Storage rules tests), Zod, React Hook Form.

**Spec:** `docs/superpowers/specs/2026-06-09-h1-profile-picture-upload-design.md`

**Branch:** `feat/h1-profile-picture-upload` (off `main`). Parallel-safe with B2 — no shared files.

**SECURITY:** This plan edits `storage.rules`. `/security-review` + `firestore-security-reviewer` are REQUIRED before PR (Task 7).

---

## Pre-flight

- [ ] **Step 0: Branch + read context**

```bash
git checkout main && git pull --ff-only
git checkout -b feat/h1-profile-picture-upload
```

Read before editing:
- `packages/firebase/src/index.ts` (services init; `getStorage` already called, not exported)
- `packages/types/src/member.ts` + `packages/types/src/member-schema.ts`
- `apps/backstage/src/features/members/repositories/member-mapper.ts` + the member repository file in that folder
- `apps/backstage/src/features/members/components/member-form.tsx` + `member-drawer.tsx`
- `packages/ui/src/components/img-slot.tsx` (style/token conventions for new components)
- `storage.rules`, `firebase.json` (storage emulator port 9199)
- The `/me` route + view (member home from #20) under `apps/backstage/src/routes` / its components

---

### Task 1: VET + add the crop dependency

**REQUIRED SKILL:** `secure-dep-vetting` — do not skip, do not assume a version.

- [ ] **Step 1: Vet `react-easy-crop`**

Invoke `secure-dep-vetting` for `react-easy-crop` (latest secure version, Node 24 compat, CVE check). If it's blocked or unmaintained, pick the vetted alternative the skill returns. Add to `packages/ui` (caret range — not security-critical).

```bash
pnpm --filter @luminova/ui add react-easy-crop@<version-from-vetting>
```

- [ ] **Step 2: Verify install + bundle awareness**

Run: `pnpm --filter @luminova/ui build`
Expected: builds clean. Note the added weight (bundle-budget-watcher runs in Task 7).

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml packages/ui/package.json
git commit -m "build(ui): add vetted crop lib for image uploader (H1)"
```

---

### Task 2: Pure image helpers (validate + downscale)

**Files:**
- Create: `packages/ui/src/lib/image.ts`
- Test: `packages/ui/src/lib/image.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { validateImage, fittedDimensions, IMAGE_MAX_BYTES } from "./image";

describe("validateImage", () => {
  it("accepts a jpeg under the size cap", () => {
    const file = new File([new Uint8Array(10)], "a.jpg", { type: "image/jpeg" });
    expect(validateImage(file)).toEqual({ ok: true });
  });
  it("rejects non-images", () => {
    const file = new File([new Uint8Array(10)], "a.pdf", { type: "application/pdf" });
    expect(validateImage(file)).toEqual({ ok: false, reason: "type" });
  });
  it("rejects oversize files", () => {
    const big = new File([new Uint8Array(IMAGE_MAX_BYTES + 1)], "a.png", { type: "image/png" });
    expect(validateImage(big)).toEqual({ ok: false, reason: "size" });
  });
});

describe("fittedDimensions", () => {
  it("downscales the long edge to max, preserves aspect", () => {
    expect(fittedDimensions(1200, 600, 512)).toEqual({ width: 512, height: 256 });
  });
  it("does not upscale smaller images", () => {
    expect(fittedDimensions(300, 200, 512)).toEqual({ width: 300, height: 200 });
  });
  it("handles square", () => {
    expect(fittedDimensions(1024, 1024, 512)).toEqual({ width: 512, height: 512 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @luminova/ui test image`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_MAX_EDGE = 512;
export const IMAGE_QUALITY = 0.8;

export type ValidateResult = { ok: true } | { ok: false; reason: "type" | "size" };

export function validateImage(file: File): ValidateResult {
  if (!file.type.startsWith("image/")) return { ok: false, reason: "type" };
  if (file.size > IMAGE_MAX_BYTES) return { ok: false, reason: "size" };
  return { ok: true };
}

export function fittedDimensions(w: number, h: number, maxEdge: number) {
  const longEdge = Math.max(w, h);
  if (longEdge <= maxEdge) return { width: w, height: h };
  const scale = maxEdge / longEdge;
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

// Canvas-based: crop to the given pixel rect, downscale, compress. Browser-only.
export async function cropAndCompress(
  imageSrc: string,
  crop: { x: number; y: number; width: number; height: number },
  maxEdge = IMAGE_MAX_EDGE,
  quality = IMAGE_QUALITY,
): Promise<Blob> {
  const img = await loadImage(imageSrc);
  const out = fittedDimensions(crop.width, crop.height, maxEdge);
  const canvas = document.createElement("canvas");
  canvas.width = out.width;
  canvas.height = out.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.drawImage(
    img,
    crop.x, crop.y, crop.width, crop.height,
    0, 0, out.width, out.height,
  );
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      quality,
    ),
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
```

Note: only `validateImage` and `fittedDimensions` are unit-tested (pure). `cropAndCompress`/`loadImage` touch canvas/DOM — covered by the component smoke test in Task 4, not here.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @luminova/ui test image`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/lib/image.ts packages/ui/src/lib/image.test.ts
git commit -m "feat(ui): pure image validate + downscale helpers (H1)"
```

---

### Task 3: `Avatar` component

**Files:**
- Create: `packages/ui/src/components/avatar.tsx`
- Test: `packages/ui/src/components/avatar.test.tsx`
- Modify: `packages/ui/src/index.ts` (barrel export — match existing export style)

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar } from "./avatar";

describe("Avatar", () => {
  it("renders the photo when src is provided", () => {
    render(<Avatar src="https://x/y.jpg" name="Ana Lopez" />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "https://x/y.jpg");
  });
  it("falls back to initials when src is null", () => {
    render(<Avatar src={null} name="Ana Lopez" />);
    expect(screen.getByText("AL")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @luminova/ui test avatar`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Reuse the existing `initials()` helper if the member-drawer already has one; otherwise inline. Follow `img-slot.tsx` token/styling conventions (JCI tokens, `cn`).

```tsx
import { cn } from "@luminova/utils";

interface AvatarProps {
  src: string | null | undefined;
  name: string;
  size?: number;
  className?: string;
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function Avatar({ src, name, size = 40, className }: AvatarProps) {
  const dimension = { width: size, height: size };
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        style={dimension}
        className={cn("rounded-full object-cover", className)}
      />
    );
  }
  return (
    <span
      style={dimension}
      aria-label={name}
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-brand-100 font-medium text-brand-700",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
```

Adjust token class names (`bg-brand-100`/`text-brand-700`) to the repo's actual JCI tokens found in `img-slot.tsx`/`theme.css`.

- [ ] **Step 4: Barrel export + run test**

Add to `packages/ui/src/index.ts` following existing pattern:
```ts
export { Avatar } from "./components/avatar";
```

Run: `pnpm --filter @luminova/ui test avatar`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/avatar.tsx packages/ui/src/components/avatar.test.tsx packages/ui/src/index.ts
git commit -m "feat(ui): Avatar component with initials fallback (H1)"
```

---

### Task 4: `ImageUploader` component (Firebase-agnostic)

**Files:**
- Create: `packages/ui/src/components/image-uploader.tsx`
- Test: `packages/ui/src/components/image-uploader.test.tsx`
- Modify: `packages/ui/src/index.ts` (barrel export)

- [ ] **Step 1: Write the failing test (smoke + validation)**

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImageUploader } from "./image-uploader";

describe("ImageUploader", () => {
  it("rejects a non-image and does not call onUpload", async () => {
    const onUpload = vi.fn();
    render(<ImageUploader currentSrc={null} name="Ana" onUpload={onUpload} onRemove={vi.fn()} />);
    const input = screen.getByTestId("image-file-input") as HTMLInputElement;
    const bad = new File([new Uint8Array(4)], "a.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [bad] } });
    await waitFor(() => expect(screen.getByText(/imagen válida|valid image/i)).toBeInTheDocument());
    expect(onUpload).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @luminova/ui test image-uploader`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Owns NO Firebase. Props: `currentSrc`, `name`, `onUpload(blob) => Promise<void>`, `onRemove() => Promise<void>`. Uses `react-easy-crop` for the crop UI in a modal, `validateImage`/`cropAndCompress` from `./lib/image`, shows the `Avatar` as preview, surfaces busy/error state.

```tsx
import { useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Avatar } from "./avatar";
import { validateImage, cropAndCompress } from "../lib/image";

interface ImageUploaderProps {
  currentSrc: string | null | undefined;
  name: string;
  onUpload: (blob: Blob) => Promise<void>;
  onRemove: () => Promise<void>;
  disabled?: boolean;
}

export function ImageUploader({ currentSrc, name, onUpload, onRemove, disabled }: ImageUploaderProps) {
  const [src, setSrc] = useState<string | null>(null); // object URL being cropped
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPixels, setAreaPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    const v = validateImage(file);
    if (!v.ok) {
      setError(v.reason === "type" ? "Selecciona una imagen válida." : "La imagen supera 5 MB.");
      return;
    }
    setError(null);
    setSrc(URL.createObjectURL(file));
  }

  async function confirmCrop() {
    if (!src || !areaPixels) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await cropAndCompress(src, areaPixels);
      await onUpload(blob);
      URL.revokeObjectURL(src);
      setSrc(null);
    } catch {
      setError("No se pudo subir la imagen. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try { await onRemove(); } catch { setError("No se pudo quitar la imagen."); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Avatar src={currentSrc} name={name} size={64} />
        <label className="cursor-pointer text-sm font-medium text-brand-700">
          {currentSrc ? "Cambiar foto" : "Subir foto"}
          <input
            data-testid="image-file-input"
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={disabled || busy}
            onChange={onFile}
          />
        </label>
        {currentSrc ? (
          <button type="button" onClick={remove} disabled={disabled || busy} className="text-sm text-red-600">
            Quitar
          </button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {src ? (
        <div className="flex flex-col gap-2">
          <div className="relative h-64 w-full bg-black/80">
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, pixels) => setAreaPixels(pixels)}
            />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={confirmCrop} disabled={busy} className="text-sm font-medium text-brand-700">
              {busy ? "Subiendo…" : "Guardar foto"}
            </button>
            <button type="button" onClick={() => { URL.revokeObjectURL(src); setSrc(null); }} disabled={busy} className="text-sm">
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
```

Adjust token classes to match the repo. Keep copy in Spanish (user-facing values) per CLAUDE.md.

- [ ] **Step 4: Barrel export + run test**

Add to `packages/ui/src/index.ts`:
```ts
export { ImageUploader } from "./components/image-uploader";
```

Run: `pnpm --filter @luminova/ui test image-uploader`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/image-uploader.tsx packages/ui/src/components/image-uploader.test.tsx packages/ui/src/index.ts
git commit -m "feat(ui): ImageUploader with square-crop + compress (H1)"
```

---

### Task 5: Firebase storage accessor + member-photo helpers

**Files:**
- Modify: `packages/firebase/src/index.ts`
- Create: `packages/firebase/src/member-photo.ts`
- Modify: `packages/firebase/src/index.ts` barrel (or wherever the package re-exports)

- [ ] **Step 1: Surface a storage accessor**

The services object already holds `storage`. Add a public accessor matching the existing pattern (mirror how `auth`/`db` are reached). Example:

```ts
export function getStorageService(): FirebaseStorage {
  return getFirebase().storage;
}
```

- [ ] **Step 2: Add upload/delete helpers**

```ts
import { getDownloadURL, ref, uploadBytes, deleteObject } from "firebase/storage";
import { getStorageService } from "./index";

const PHOTO_PATH = (memberId: string) => `members/${memberId}/profile.jpg`;

export async function uploadMemberPhoto(memberId: string, blob: Blob): Promise<string> {
  const storageRef = ref(getStorageService(), PHOTO_PATH(memberId));
  await uploadBytes(storageRef, blob, { contentType: "image/jpeg" });
  return await getDownloadURL(storageRef);
}

export async function deleteMemberPhoto(memberId: string): Promise<void> {
  const storageRef = ref(getStorageService(), PHOTO_PATH(memberId));
  try {
    await deleteObject(storageRef);
  } catch (err) {
    // object-not-found is fine; rethrow anything else for the caller to log
    if ((err as { code?: string }).code !== "storage/object-not-found") throw err;
  }
}
```

Fixed `profile.jpg` filename because `cropAndCompress` always emits JPEG — new upload overwrites the old object, no orphans.

- [ ] **Step 3: Export from the package**

Add `export { uploadMemberPhoto, deleteMemberPhoto, getStorageService } from "./member-photo";` (or via the package's existing export surface). Match the no-barrel-in-features rule — this is a package public API, exports are expected here.

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm --filter @luminova/firebase typecheck`
Expected: PASS.

```bash
git add packages/firebase/src/index.ts packages/firebase/src/member-photo.ts
git commit -m "feat(firebase): storage accessor + member photo upload/delete (H1)"
```

---

### Task 6: Repo `setProfilePicture` + wire both surfaces

**Files:**
- Modify: the member repository in `apps/backstage/src/features/members/repositories/`
- Modify: `apps/backstage/src/features/members/components/member-form.tsx` (or `member-drawer.tsx` — whichever owns the edit body)
- Modify: the `/me` view component
- Possibly add: a small TanStack Query mutation hook in the members `hooks/` folder

- [ ] **Step 1: Add the repo write**

Add a narrow method that writes ONLY `profilePicture` (string or null). Do NOT widen `MemberInput`/the form Zod schema — the photo is its own action.

```ts
// in the member repository
export async function setProfilePicture(memberId: string, url: string | null): Promise<void> {
  await updateDoc(doc(db, "members", memberId), { profilePicture: url });
}
```

Use whatever Firestore handle/pattern the repo already uses (it has `members` access today).

- [ ] **Step 2: Shared upload handlers**

Create a small hook (or inline handlers) that both surfaces use:

```ts
// onUpload
async (blob: Blob) => {
  const url = await uploadMemberPhoto(memberId, blob);
  await setProfilePicture(memberId, url);
  await queryClient.invalidateQueries({ queryKey: ["members"] }); // match existing keys
}
// onRemove
async () => {
  await setProfilePicture(memberId, null); // null the field first
  await deleteMemberPhoto(memberId).catch((e) => console.warn("orphan photo", memberId, e));
  await queryClient.invalidateQueries({ queryKey: ["members"] });
}
```

Order on remove: null the field first, then best-effort delete the object (log orphan, never block the user) — per spec error handling.

- [ ] **Step 3: Admin surface — member form/drawer**

In the member edit body, render the uploader above the form fields:

```tsx
<ImageUploader
  currentSrc={member.profilePicture}
  name={member.name}
  onUpload={handleUpload}
  onRemove={handleRemove}
/>
```

`memberId = member.id`. Replace any ad-hoc initials avatar in the drawer header with `<Avatar src={member.profilePicture} name={member.name} />`.

- [ ] **Step 4: Member self surface — `/me`**

In the `/me` view, the current member's `memberId` comes from their own member doc (the same one #20 reads for points/QR). Render the same `ImageUploader` scoped to that id. The member-self ability already allows updating own `Member` record; the Storage rule (Task 7) enforces the folder.

- [ ] **Step 5: Typecheck + lint + commit**

Run:
```bash
pnpm --filter backstage typecheck
pnpm --filter backstage lint
```
Expected: PASS.

```bash
git add apps/backstage/src/features/members apps/backstage/src/routes
git commit -m "feat(backstage): wire profile-picture uploader on member form + /me (H1)"
```

---

### Task 7: Storage rules + security review

**Files:**
- Modify: `storage.rules`
- Create: `storage.rules.test.ts` (or the repo's existing rules-test location/pattern — check how `firestore.rules` tests are wired)

- [ ] **Step 1: Write the failing rules test**

Use `@firebase/rules-unit-testing` against the Storage emulator (port 9199). Cover: privileged writes any member; owner writes own; non-owner member blocked; unauthenticated blocked; read requires auth. Seed a `members/{id}` Firestore doc with a `uid` so the rule's `firestore.get` resolves.

```ts
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { describe, it, beforeAll, afterAll } from "vitest";
import { setDoc, doc } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";

// pseudo-structure — match the repo's existing rules-test harness
let testEnv: Awaited<ReturnType<typeof initializeTestEnvironment>>;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-luminova",
    storage: { rules: readFileSync("storage.rules", "utf8") },
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});
afterAll(() => testEnv.cleanup());

const bytes = new Uint8Array([1, 2, 3]);

it("owner uploads to own folder", async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "members/m1"), { uid: "u1" });
  });
  const owner = testEnv.authenticatedContext("u1", { roles: ["Member"] });
  await assertSucceeds(uploadBytes(ref(owner.storage(), "members/m1/profile.jpg"), bytes));
});

it("privileged uploads to any member", async () => {
  const admin = testEnv.authenticatedContext("admin1", { roles: ["Admin"] });
  await assertSucceeds(uploadBytes(ref(admin.storage(), "members/m1/profile.jpg"), bytes));
});

it("non-owner member is blocked", async () => {
  const other = testEnv.authenticatedContext("u2", { roles: ["Member"] });
  await assertFails(uploadBytes(ref(other.storage(), "members/m1/profile.jpg"), bytes));
});

it("unauthenticated is blocked", async () => {
  const anon = testEnv.unauthenticatedContext();
  await assertFails(uploadBytes(ref(anon.storage(), "members/m1/profile.jpg"), bytes));
});
```

- [ ] **Step 2: Run to verify it fails**

Run (matching repo's rules-test command; e.g.):
```bash
firebase emulators:exec --only storage,firestore "pnpm vitest run storage.rules.test.ts"
```
Expected: FAIL — current blanket rule lets non-owner write (assertFails fails) / firestore.get not used.

- [ ] **Step 3: Write the rule**

```
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    function isPrivileged() {
      return request.auth != null
        && request.auth.token.roles is list
        && (request.auth.token.roles.hasAny(['Admin', 'Membership']));
    }
    function ownsMember(memberId) {
      return request.auth != null
        && firestore.get(/databases/(default)/documents/members/$(memberId)).data.uid == request.auth.uid;
    }

    match /members/{memberId}/{file} {
      allow read: if request.auth != null;
      allow write: if isPrivileged() || ownsMember(memberId);
    }

    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

Confirm the custom-claims shape: the test seeds `roles` as a token claim; verify the real auth provisioning sets `roles` on the Firebase token (the same claims `claims.roles` the app reads). If the claim key differs, align both the rule and test to reality — do not guess.

- [ ] **Step 4: Run to verify it passes**

Run the same emulator command.
Expected: PASS (all five cases).

- [ ] **Step 5: Security review (REQUIRED)**

- Dispatch `firestore-security-reviewer` subagent on the rules + repo access.
- Run `/security-review` on the full branch diff (touches Storage rules + upload path).
- Address any Critical/High before PR.

- [ ] **Step 6: Commit**

```bash
git add storage.rules storage.rules.test.ts
git commit -m "feat(storage): scope member photo writes to owner or privileged (H1)"
```

---

### Task 8: Finalize — bundle, lint, PR

- [ ] **Step 1: Full checks**

Run:
```bash
pnpm --filter @luminova/ui test
pnpm --filter backstage typecheck
pnpm --filter backstage lint
pnpm --filter @luminova/firebase typecheck
```
Expected: all PASS.

- [ ] **Step 2: bundle-budget-watcher**

Dispatch `bundle-budget-watcher` (crop lib added weight). Address budget breaches (lazy-load the cropper if needed: dynamic `import()` of `react-easy-crop` inside `ImageUploader` so it only loads when a file is picked).

- [ ] **Step 3: react-best-practices**

Apply to the new/modified `.tsx`. Verify no inline-object-prop re-render traps; the cropper modal mounts only when `src` is set.

- [ ] **Step 4: Open PR**

```bash
git push -u origin feat/h1-profile-picture-upload
gh pr create --title "feat: profilePicture upload — admin + member self (H1)" --body "$(cat <<'EOF'
## Summary
- Shared `ImageUploader` (crop + downscale + compress) in @luminova/ui; new `Avatar`.
- @luminova/firebase exposes storage accessor + uploadMemberPhoto/deleteMemberPhoto.
- Admin sets any member's photo (member form); members set their own on /me.
- storage.rules scoped: owner-or-privileged write; path members/{memberId}/profile.jpg.
- Spec: docs/superpowers/specs/2026-06-09-h1-profile-picture-upload-design.md

## Test plan
- [ ] @luminova/ui unit tests (image helpers, Avatar, ImageUploader)
- [ ] storage.rules emulator tests (owner / privileged / non-owner / anon)
- [ ] /security-review run (storage.rules + upload path) — REQUIRED
- [ ] firestore-security-reviewer run
- [ ] bundle-budget-watcher (crop lib)
EOF
)"
pnpm pr-tests
```

---

## Self-Review (author)

- **Spec coverage:** path/rule → Task 7; Avatar → Task 3; ImageUploader+crop → Task 4; helpers → Task 2; firebase export+helpers → Task 5; repo write + both surfaces → Task 6; crop dep vetted → Task 1; bundle → Task 8. ✓
- **Placeholders:** token class names + exact repo handles flagged "match existing/confirm" because they're environment facts the engineer reads in Step 0 — code bodies are complete. ✓
- **Type consistency:** `uploadMemberPhoto`/`deleteMemberPhoto`/`setProfilePicture`/`cropAndCompress`/`validateImage`/`fittedDimensions`/`Avatar`/`ImageUploader` signatures consistent across tasks. ✓
- **Security gate:** Task 7 blocks PR on `/security-review` + `firestore-security-reviewer`. ✓
- **Open risk:** custom-claims key for `roles` in the Storage rule must match real provisioning — Step 3/Task 7 mandates verifying, not guessing.
