# Public Allies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Surface real allies (name + logo + category) on the public spotlight home wall via a curated world-read `allyShowcase` projection.

**Architecture:** Beacon `onAllyWritten` trigger projects auth-gated `allies` docs into a world-read `allyShowcase` collection (public fields only). Spotlight reads it via firestore-lite. Backstage gains a category select + logo upload.

**Tech Stack:** TypeScript strict, Firebase (Functions/Firestore/Storage rules), React 19, TanStack Query (backstage), firestore-lite (spotlight), zod, vitest.

Spec: `docs/specs/2026-06-21-public-allies-design.md`.

---

## Task 1: Public ally types (engine subpath)

**Files:**
- Create: `packages/types/src/engine/ally-public.ts`
- Modify: `packages/types/src/engine/index.ts`
- Modify: `packages/types/src/ally.ts`
- Modify: `packages/types/src/ally-schema.ts`
- Modify: `packages/types/src/index.ts`
- Test: `packages/types/src/engine/ally-public.test.ts`, `packages/types/src/ally-schema.test.ts`

- [ ] **Step 1: Write failing test** `ally-public.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { ALLY_CATEGORIES, ALLY_CATEGORY_LABELS } from "./ally-public.js";

describe("ally-public", () => {
  it("has 4 categories with a Spanish label each", () => {
    expect(ALLY_CATEGORIES).toEqual(["University", "PublicInstitution", "Organization", "Company"]);
    for (const c of ALLY_CATEGORIES) expect(ALLY_CATEGORY_LABELS[c]).toMatch(/\S/);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** `pnpm --filter @luminova/types test -- ally-public`

- [ ] **Step 3: Create `ally-public.ts`**

```ts
export const ALLY_CATEGORIES = ["University", "PublicInstitution", "Organization", "Company"] as const;
export type AllyCategory = (typeof ALLY_CATEGORIES)[number];

export const ALLY_CATEGORY_LABELS: Record<AllyCategory, string> = {
  University: "Universidades",
  PublicInstitution: "Instituciones públicas",
  Organization: "Organizaciones",
  Company: "Empresas",
};

/** Curated public projection of an ally. Beacon writes it; world-read. */
export interface AllyShowcaseItem {
  id: string;
  name: string;
  logoUrl: string;
  category: AllyCategory;
}
```

- [ ] **Step 4: Wire exports.** In `engine/index.ts` add:
```ts
export { ALLY_CATEGORIES, ALLY_CATEGORY_LABELS, type AllyCategory, type AllyShowcaseItem } from "./ally-public.js";
```

- [ ] **Step 5: Extend `Ally`** (`ally.ts`):
```ts
import type { Timestamp } from "firebase/firestore";
import type { AllyCategory } from "./engine/ally-public.js";

export interface Ally {
  id: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  logoUrl: string | null;
  category: AllyCategory | null;
  active: boolean;
  deletedAt: Timestamp | null;
}
```

- [ ] **Step 6: Extend schema** (`ally-schema.ts`):
```ts
import { z } from "zod";
import { ALLY_CATEGORIES } from "./engine/ally-public.js";

export const allySchema = z.object({
  companyName: z.string().min(3, "Mínimo 3 caracteres."),
  contactPerson: z.string().min(3, "Mínimo 3 caracteres."),
  phone: z.string().min(1, "Requerido."),
  email: z.string().email("Correo inválido."),
  category: z.enum(ALLY_CATEGORIES).optional(),
});

export type AllyInput = z.infer<typeof allySchema>;
```

- [ ] **Step 7: Re-export `AllyCategory` from main barrel** (`index.ts`), next to the `Ally` export:
```ts
export type { Ally } from "./ally.js";
export type { AllyCategory, AllyShowcaseItem } from "./engine/ally-public.js";
export { ALLY_CATEGORIES, ALLY_CATEGORY_LABELS } from "./engine/ally-public.js";
```

- [ ] **Step 8: Add schema test** to `ally-schema.test.ts`:
```ts
it("accepts a valid category", () => {
  expect(allySchema.safeParse({ companyName: "ACME", contactPerson: "Ana Lopez", phone: "1", email: "a@b.co", category: "University" }).success).toBe(true);
});
it("rejects an unknown category", () => {
  expect(allySchema.safeParse({ companyName: "ACME", contactPerson: "Ana Lopez", phone: "1", email: "a@b.co", category: "Nope" }).success).toBe(false);
});
it("allows category to be omitted", () => {
  expect(allySchema.safeParse({ companyName: "ACME", contactPerson: "Ana Lopez", phone: "1", email: "a@b.co" }).success).toBe(true);
});
```

- [ ] **Step 9: Run** `pnpm --filter @luminova/types test` → PASS. Then `pnpm --filter @luminova/types typecheck`.

- [ ] **Step 10: Commit** `feat(types): ally category enum + public projection type`

---

## Task 2: Beacon `projectAlly` (pure projection)

**Files:**
- Create: `apps/beacon/src/showcase/project-ally.ts`
- Test: `apps/beacon/src/showcase/project-ally.test.ts`

- [ ] **Step 1: Write failing test** `project-ally.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { projectAlly } from "./project-ally.js";

const ok = {
  companyName: "Unifranz",
  logoUrl: "https://cdn/x.png",
  category: "University",
  active: true,
  deletedAt: null,
};

describe("projectAlly", () => {
  it("projects a complete active ally", () => {
    expect(projectAlly("a1", ok)).toEqual({ id: "a1", name: "Unifranz", logoUrl: "https://cdn/x.png", category: "University" });
  });
  it("drops a soft-deleted ally", () => {
    expect(projectAlly("a1", { ...ok, active: false, deletedAt: {} })).toBeNull();
  });
  it("drops an ally with no logo", () => {
    expect(projectAlly("a1", { ...ok, logoUrl: null })).toBeNull();
  });
  it("drops a non-https logo (no public leak of http)", () => {
    expect(projectAlly("a1", { ...ok, logoUrl: "http://cdn/x.png" })).toBeNull();
  });
  it("drops an unknown category", () => {
    expect(projectAlly("a1", { ...ok, category: "Nope" })).toBeNull();
  });
  it("drops an empty name", () => {
    expect(projectAlly("a1", { ...ok, companyName: "" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect FAIL** `pnpm --filter beacon test -- project-ally`

- [ ] **Step 3: Implement `project-ally.ts`**

```ts
import { ALLY_CATEGORIES, type AllyCategory, type AllyShowcaseItem } from "@luminova/types/engine";

/**
 * Project a raw ally doc into a curated public AllyShowcaseItem, or null when it is
 * not publicly showable (soft-deleted, or missing logo/category). The logo backs a
 * public <img>, so only an https URL is exposed — any other value projects null.
 */
export function projectAlly(id: string, data: Record<string, unknown>): AllyShowcaseItem | null {
  if (data.active !== true || data.deletedAt != null) return null;
  const name = data.companyName;
  if (typeof name !== "string" || name.length === 0) return null;
  const logoUrl = data.logoUrl;
  if (typeof logoUrl !== "string" || !logoUrl.startsWith("https://")) return null;
  const category = data.category;
  if (!ALLY_CATEGORIES.includes(category as AllyCategory)) return null;
  return { id, name, logoUrl, category: category as AllyCategory };
}
```

- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(beacon): projectAlly public projection helper`

---

## Task 3: Beacon `onAllyWritten` trigger

**Files:**
- Modify: `apps/beacon/src/index.ts`

- [ ] **Step 1: Add import** next to the project-initiative import:
```ts
import { projectAlly } from "./showcase/project-ally.js";
```

- [ ] **Step 2: Add the trigger** (near `onMemberWritten`, before the `setUserRoles` re-export):
```ts
export const onAllyWritten = onDocumentWritten("allies/{id}", async (event) => {
  const ref = db().doc(`allyShowcase/${event.params.id}`);
  const after = event.data?.after;
  const item = after?.exists ? projectAlly(event.params.id, after.data() as Record<string, unknown>) : null;
  if (!item) {
    await ref.delete();
    return;
  }
  await ref.set(item);
});
```

- [ ] **Step 3: Verify** `pnpm --filter beacon run ci` (eslint + tsc + vitest) → PASS.
- [ ] **Step 4: Commit** `feat(beacon): onAllyWritten projects allyShowcase`

---

## Task 4: firestore.rules — `allyShowcase` world-read

**Files:**
- Modify: `firestore.rules`
- Modify: `tests/firestore-rules/rules.test.ts`

- [ ] **Step 1: Add failing test** in the `showcase` describe area (mirror its cases) — new `describe`:
```ts
describe("allyShowcase (public read, beacon-only write)", () => {
  it("allows anonymous read", async () => {
    await assertSucceeds(getDoc(doc(anon(), "allyShowcase/a1")));
  });
  it("denies anonymous write", async () => {
    await assertFails(setDoc(doc(anon(), "allyShowcase/a2"), { name: "x" }));
  });
  it("denies Admin write", async () => {
    await assertFails(setDoc(doc(as("u", ["Admin"]), "allyShowcase/a2"), { name: "x" }));
  });
});
```
Also seed a doc in the existing top-level seed block (next to `showcase/s1`):
```ts
await setDoc(doc(db, "allyShowcase/a1"), { id: "a1", name: "Unifranz", logoUrl: "https://cdn/x.png", category: "University" });
```

- [ ] **Step 2: Run, expect FAIL** — `tests/firestore-rules` (see Task 11 run note for emulator). Expect the read/write cases to fail (rule absent → deny-all denies read).

- [ ] **Step 3: Add rule** after the `match /showcase/{id}` block:
```
    match /allyShowcase/{id} {
      allow read: if true;
      allow write: if false;
    }
```

- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(rules): allyShowcase world-read projection`

---

## Task 5: storage.rules — ally logo blob

**Files:**
- Modify: `storage.rules`
- Modify: `tests/storage-rules/rules.test.ts`

- [ ] **Step 1: Add failing tests** — new describe (model on the initiative-photo block; `isPrivileged` users = Admin/Membership):
```ts
const LOGO = "allies/a1/logo";
describe("storage.rules — ally logos", () => {
  it("allows anyone to read a logo (public site)", async () => {
    await assertSucceeds(getBytes(ref(storageAnon(), LOGO)));
  });
  it("allows Admin to upload a png logo", async () => {
    await assertSucceeds(uploadBytes(ref(storageAs("admin1", ["Admin"]), LOGO), PHOTO, { contentType: "image/png" }));
  });
  it("denies a plain Member from uploading", async () => {
    await assertFails(uploadBytes(ref(storageAs("m", ["Member"]), LOGO), PHOTO, { contentType: "image/png" }));
  });
  it("denies a non-image contentType", async () => {
    await assertFails(uploadBytes(ref(storageAs("admin1", ["Admin"]), LOGO), PHOTO, { contentType: "application/pdf" }));
  });
  it("allows Admin to delete a logo", async () => {
    await assertSucceeds(deleteObject(ref(storageAs("admin1", ["Admin"]), LOGO)));
  });
});
```
(Reuse the file's existing `storageAs`/`storageAnon`/`PHOTO` helpers and `getBytes`/`deleteObject` imports — add any missing import from `firebase/storage`.)

- [ ] **Step 2: Run, expect FAIL** (rule absent → deny-all).

- [ ] **Step 3: Add to `storage.rules`** — `isValidLogo()` near `isValidPhoto()`, and the match block before the `match /{allPaths=**}` catch-all:
```
    function isValidLogo() {
      return request.resource.contentType in ['image/png', 'image/jpeg']
        && request.resource.size <= 2 * 1024 * 1024;
    }

    match /allies/{id}/logo {
      allow read: if true;
      allow create, update: if isPrivileged() && isValidLogo();
      allow delete: if isPrivileged();
    }
```

- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(rules): ally logo storage (public read, privileged write)`

---

## Task 6: Firebase storage helper

**Files:**
- Create: `packages/firebase/src/ally-logo.ts`
- Modify: `packages/firebase/src/index.ts`

- [ ] **Step 1: Create `ally-logo.ts`** (mirror `member-photo.ts`, but keep the raw file + its contentType — no JPEG re-encode, so PNG transparency survives):
```ts
import { getDownloadURL, ref, uploadBytes, deleteObject } from "firebase/storage";
import { getStorageService } from "./index";

function logoPath(allyId: string): string {
  return `allies/${allyId}/logo`;
}

export async function uploadAllyLogo(allyId: string, file: File): Promise<string> {
  const storageRef = ref(getStorageService(), logoPath(allyId));
  await uploadBytes(storageRef, file, { contentType: file.type });
  return await getDownloadURL(storageRef);
}

export async function deleteAllyLogo(allyId: string): Promise<void> {
  const storageRef = ref(getStorageService(), logoPath(allyId));
  try {
    await deleteObject(storageRef);
  } catch (err) {
    if ((err as { code?: string }).code !== "storage/object-not-found") throw err;
  }
}
```

- [ ] **Step 2: Export** in `index.ts` (next to the `member-photo` export):
```ts
export { uploadAllyLogo, deleteAllyLogo } from "./ally-logo";
```

- [ ] **Step 3: Verify** `pnpm --filter @luminova/firebase typecheck`.
- [ ] **Step 4: Commit** `feat(firebase): ally logo upload/delete helpers`

---

## Task 7: Backstage mapper + repository

**Files:**
- Modify: `apps/backstage/src/features/allies/repositories/ally-mapper.ts`
- Modify: `apps/backstage/src/features/allies/repositories/ally-repository.ts`
- Test: `apps/backstage/src/features/allies/repositories/ally-mapper.test.ts` (create if absent)

- [ ] **Step 1: Write failing mapper test**
```ts
import { describe, it, expect } from "vitest";
import { toAllyCreateDoc, toAllyUpdateDoc } from "./ally-mapper";

const base = { companyName: "ACME", contactPerson: "Ana Lopez", phone: "1", email: "a@b.co" } as const;

describe("ally-mapper", () => {
  it("create doc defaults logoUrl null + category null", () => {
    expect(toAllyCreateDoc(base)).toMatchObject({ logoUrl: null, category: null, active: true, deletedAt: null });
  });
  it("create doc carries a set category", () => {
    expect(toAllyCreateDoc({ ...base, category: "University" })).toMatchObject({ category: "University" });
  });
  it("update doc never touches logoUrl or system fields", () => {
    const out = toAllyUpdateDoc({ ...base, category: "Company" });
    expect(out).toMatchObject({ category: "Company" });
    expect(out).not.toHaveProperty("logoUrl");
    expect(out).not.toHaveProperty("active");
  });
});
```

- [ ] **Step 2: Run, expect FAIL** `pnpm --filter backstage test -- ally-mapper`

- [ ] **Step 3: Update `ally-mapper.ts`**
```ts
import type { AllyInput } from "@luminova/types";

function editableFields(data: AllyInput) {
  return {
    companyName: data.companyName,
    contactPerson: data.contactPerson,
    phone: data.phone,
    email: data.email,
    category: data.category ?? null,
  };
}

export function toAllyCreateDoc(data: AllyInput) {
  return { ...editableFields(data), logoUrl: null, active: true, deletedAt: null };
}

export function toAllyUpdateDoc(data: AllyInput) {
  return editableFields(data);
}
```

- [ ] **Step 4: Add repo methods** to `ally-repository.ts` (after `update`):
```ts
  async setLogo(id: string, logoUrl: string): Promise<void> {
    await updateDoc(doc(this.collection, id), { logoUrl });
  }

  async clearLogo(id: string): Promise<void> {
    await updateDoc(doc(this.collection, id), { logoUrl: null });
  }
```

- [ ] **Step 5: Run** → PASS. `pnpm --filter backstage typecheck`.
- [ ] **Step 6: Commit** `feat(backstage): ally mapper category + repo logo methods`

---

## Task 8: LogoUploader component

**Files:**
- Create: `apps/backstage/src/features/allies/components/logo-uploader.tsx`
- Test: `apps/backstage/src/features/allies/components/logo-uploader.test.tsx`

- [ ] **Step 1: Write failing test**
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LogoUploader } from "./logo-uploader";

function pngFile(size = 100) {
  const f = new File([new Uint8Array(size)], "logo.png", { type: "image/png" });
  return f;
}

describe("LogoUploader", () => {
  it("uploads a valid png", async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined);
    render(<LogoUploader currentSrc={null} onUpload={onUpload} onRemove={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/logo/i), { target: { files: [pngFile()] } });
    await waitFor(() => expect(onUpload).toHaveBeenCalledOnce());
  });
  it("rejects a non-image file", async () => {
    const onUpload = vi.fn();
    render(<LogoUploader currentSrc={null} onUpload={onUpload} onRemove={vi.fn()} />);
    const pdf = new File([new Uint8Array(10)], "x.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/logo/i), { target: { files: [pdf] } });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(onUpload).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect FAIL** `pnpm --filter backstage test -- logo-uploader`

- [ ] **Step 3: Implement `logo-uploader.tsx`**
```tsx
import { useState, type ChangeEvent } from "react";

const ACCEPTED = ["image/png", "image/jpeg"];
const MAX_BYTES = 2 * 1024 * 1024;

interface LogoUploaderProps {
  currentSrc: string | null;
  onUpload: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
  disabled?: boolean;
}

export function LogoUploader({ currentSrc, onUpload, onRemove, disabled }: LogoUploaderProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      setError("Usa una imagen PNG o JPEG.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("El logo supera 2 MB.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onUpload(file);
    } catch {
      setError("No se pudo subir el logo. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-medium text-ink-1">Logo</span>
      {currentSrc && (
        <img src={currentSrc} alt="Logo actual" className="h-16 w-auto rounded-card border border-line object-contain p-1" />
      )}
      <input
        type="file"
        aria-label="Logo"
        accept="image/png,image/jpeg"
        disabled={disabled || busy}
        onChange={(e) => void onFile(e)}
        className="text-[13px]"
      />
      {currentSrc && (
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => void onRemove()}
          className="self-start text-[13px] font-medium text-error transition-colors hover:opacity-80 disabled:opacity-50"
        >
          Quitar logo
        </button>
      )}
      {error && (
        <div role="alert" className="text-[13px] text-error">
          {error}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(backstage): LogoUploader component`

---

## Task 9: Ally form — category select + logo area

**Files:**
- Modify: `apps/backstage/src/features/allies/components/ally-form.tsx`
- Modify: `apps/backstage/src/features/allies/components/ally-form.test.tsx`

- [ ] **Step 1: Extend the form test** — add a case asserting the category select renders + a logo area appears only in edit mode:
```tsx
it("renders the category select", () => {
  render(<AllyForm submitLabel="Crear" onSubmit={vi.fn()} />);
  expect(screen.getByLabelText(/categoría/i)).toBeInTheDocument();
});
it("shows the logo uploader only when editing an existing ally", () => {
  const ally = { id: "a1", companyName: "ACME", contactPerson: "Ana Lopez", phone: "1", email: "a@b.co", logoUrl: null, category: null, active: true, deletedAt: null } as const;
  const { rerender } = render(<AllyForm submitLabel="Crear" onSubmit={vi.fn()} />);
  expect(screen.queryByLabelText(/^logo$/i)).not.toBeInTheDocument();
  rerender(<AllyForm ally={ally} submitLabel="Guardar" onSubmit={vi.fn()} onUploadLogo={vi.fn()} onRemoveLogo={vi.fn()} />);
  expect(screen.getByLabelText(/^logo$/i)).toBeInTheDocument();
});
```
(Keep/adjust existing tests: the form now takes `ally?` instead of `defaultValues` — update those call sites.)

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Rewrite `ally-form.tsx`**
```tsx
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Field, Input } from "@luminova/ui";
import { allySchema, ALLY_CATEGORIES, ALLY_CATEGORY_LABELS, type AllyInput, type Ally } from "@luminova/types";
import { LogoUploader } from "./logo-uploader";

interface AllyFormProps {
  ally?: Ally;
  submitLabel: string;
  onSubmit: (data: AllyInput) => Promise<void>;
  onUploadLogo?: (file: File) => Promise<void>;
  onRemoveLogo?: () => Promise<void>;
}

function toDefaults(ally?: Ally): AllyInput {
  return {
    companyName: ally?.companyName ?? "",
    contactPerson: ally?.contactPerson ?? "",
    phone: ally?.phone ?? "",
    email: ally?.email ?? "",
    category: ally?.category ?? undefined,
  };
}

export function AllyForm({ ally, submitLabel, onSubmit, onUploadLogo, onRemoveLogo }: AllyFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AllyInput>({
    resolver: zodResolver(allySchema),
    defaultValues: toDefaults(ally),
  });

  const submit = handleSubmit(async (data) => {
    setFormError(null);
    try {
      await onSubmit(data);
    } catch {
      setFormError("No se pudo guardar. Intenta de nuevo.");
    }
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Field label="Empresa" htmlFor="companyName" required error={errors.companyName?.message}>
        <Input id="companyName" {...register("companyName")} />
      </Field>
      <Field label="Encargado" htmlFor="contactPerson" required error={errors.contactPerson?.message}>
        <Input id="contactPerson" {...register("contactPerson")} />
      </Field>
      <Field label="Teléfono" htmlFor="phone" required error={errors.phone?.message}>
        <Input id="phone" {...register("phone")} />
      </Field>
      <Field label="Correo" htmlFor="email" required error={errors.email?.message}>
        <Input id="email" type="email" {...register("email")} />
      </Field>
      <Field label="Categoría" htmlFor="category" error={errors.category?.message}>
        <select
          id="category"
          {...register("category")}
          className="h-11 w-full rounded-[8px] border border-line bg-surface px-3 text-[14px] text-ink-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jci-blue"
        >
          <option value="">Sin categoría</option>
          {ALLY_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {ALLY_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </Field>

      {ally && onUploadLogo && onRemoveLogo ? (
        <LogoUploader currentSrc={ally.logoUrl} onUpload={onUploadLogo} onRemove={onRemoveLogo} disabled={isSubmitting} />
      ) : (
        <p className="text-[13px] text-ink-2">Guarda el aliado y vuelve a editarlo para añadir su logo.</p>
      )}

      {formError && (
        <div role="alert" className="text-[13px] text-[#c0392b]">
          {formError}
        </div>
      )}
      <Button as="button" type="submit" className="mt-1 w-full justify-center">
        {isSubmitting ? "Guardando…" : submitLabel}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Run** → PASS. `pnpm --filter backstage typecheck` (route still passes `defaultValues` — fixed in Task 10).
- [ ] **Step 5: Commit** `feat(backstage): ally form category + logo area`

---

## Task 10: Logo hooks + route wiring + table column

**Files:**
- Create: `apps/backstage/src/features/allies/hooks/use-set-ally-logo.ts`
- Create: `apps/backstage/src/features/allies/hooks/use-remove-ally-logo.ts`
- Modify: `apps/backstage/src/routes/_app.allies.tsx`
- Modify: `apps/backstage/src/features/allies/components/ally-table.tsx`

- [ ] **Step 1: Create `use-set-ally-logo.ts`**
```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { uploadAllyLogo } from "@luminova/firebase";
import { AllyRepository } from "../repositories/ally-repository";
import { allyKeys } from "./ally-keys";

export function useSetAllyLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const url = await uploadAllyLogo(id, file);
      await new AllyRepository().setLogo(id, url);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: allyKeys.all }),
  });
}
```

- [ ] **Step 2: Create `use-remove-ally-logo.ts`**
```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteAllyLogo } from "@luminova/firebase";
import { AllyRepository } from "../repositories/ally-repository";
import { allyKeys } from "./ally-keys";

export function useRemoveAllyLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await deleteAllyLogo(id);
      await new AllyRepository().clearLogo(id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: allyKeys.all }),
  });
}
```

- [ ] **Step 3: Rewire route `_app.allies.tsx`** — drop `allyToInput`; pass `ally` + logo callbacks. Replace the form-related parts:
```tsx
import { useSetAllyLogo } from "../features/allies/hooks/use-set-ally-logo";
import { useRemoveAllyLogo } from "../features/allies/hooks/use-remove-ally-logo";
```
Add inside `AlliesPage` (next to the other mutations):
```tsx
  const setLogo = useSetAllyLogo();
  const removeLogo = useRemoveAllyLogo();
```
Replace the `<AllyForm ... />` usage:
```tsx
        {editing !== null && (
          <AllyForm
            key={editing === "new" ? "new" : editing.id}
            ally={editing === "new" ? undefined : editing}
            submitLabel={editing === "new" ? "Crear" : "Guardar"}
            onSubmit={handleSubmit}
            onUploadLogo={
              editing !== "new"
                ? (file) => setLogo.mutateAsync({ id: editing.id, file })
                : undefined
            }
            onRemoveLogo={editing !== "new" ? () => removeLogo.mutateAsync(editing.id) : undefined}
          />
        )}
```
Remove the now-unused `allyToInput` function and `AllyInput` import if unused (keep `Ally`).

- [ ] **Step 4: Add table logo + category column** in `ally-table.tsx` — import labels, add a leading column:
```tsx
import { ALLY_CATEGORY_LABELS } from "@luminova/types";
import { Badge } from "@luminova/ui";
```
Add as the first column entry:
```tsx
  {
    id: "logo",
    header: "Logo",
    cell: (ally) =>
      ally.logoUrl ? (
        <img src={ally.logoUrl} alt={`Logo de ${ally.companyName}`} className="h-8 w-auto max-w-20 object-contain" />
      ) : (
        <span className="text-ink-2">—</span>
      ),
  },
```
And a category column after `company`:
```tsx
  {
    id: "category",
    header: "Categoría",
    sortValue: (ally) => (ally.category ? ALLY_CATEGORY_LABELS[ally.category] : ""),
    cell: (ally) =>
      ally.category ? <Badge tone="blue">{ALLY_CATEGORY_LABELS[ally.category]}</Badge> : <span className="text-ink-2">—</span>,
  },
```
(Confirm `Badge` `tone` values from an existing usage; fall back to a plain `<span>` chip if `tone="blue"` is invalid.)

- [ ] **Step 5: Run** `pnpm --filter backstage test` + `pnpm --filter backstage typecheck` → PASS.
- [ ] **Step 6: Commit** `feat(backstage): wire ally logo upload + table logo/category`

---

## Task 11: Spotlight firestore-lite reader

**Files:**
- Create: `apps/spotlight/src/allies/ally-showcase-firestore.ts`
- Test: `apps/spotlight/src/allies/ally-showcase-firestore.test.ts`

- [ ] **Step 1: Write failing test** (pure sort; mirror `showcase-firestore.test.ts`)
```ts
import { describe, it, expect } from "vitest";
import { sortByName } from "./ally-showcase-firestore";
import type { AllyShowcaseItem } from "@luminova/types/engine";

const a = (id: string, name: string): AllyShowcaseItem => ({ id, name, logoUrl: "https://cdn/" + id, category: "University" });

describe("sortByName", () => {
  it("sorts allies alphabetically (es)", () => {
    expect(sortByName([a("2", "Zeta"), a("1", "Alfa")]).map((x) => x.name)).toEqual(["Alfa", "Zeta"]);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** `pnpm --filter spotlight test -- ally-showcase-firestore`

- [ ] **Step 3: Implement `ally-showcase-firestore.ts`**
```ts
import { collection, getDocs } from "firebase/firestore/lite";
import { getFirestoreLite } from "@luminova/firebase";
import type { AllyShowcaseItem } from "@luminova/types/engine";

export function sortByName(items: AllyShowcaseItem[]): AllyShowcaseItem[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export async function fetchAllies(): Promise<AllyShowcaseItem[]> {
  const db = getFirestoreLite();
  const snap = await getDocs(collection(db, "allyShowcase"));
  return sortByName(snap.docs.map((d) => d.data() as AllyShowcaseItem));
}
```

- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(spotlight): allyShowcase firestore-lite reader`

> **Emulator run note (Tasks 4, 5):** if `pnpm dev` (emulators) is already up, run rules tests directly against the live emulator — `firebase emulators:exec` collides on the ports. Use the repo's existing rules-test command (`pnpm --filter <rules pkg> test` or the documented `with-emulator-lock.sh`). Confirm the exact command from `package.json` before running.

---

## Task 12: Spotlight hook + render, drop placeholder

**Files:**
- Create: `apps/spotlight/src/allies/use-allies.ts`
- Modify: `apps/spotlight/src/routes/index.tsx`

- [ ] **Step 1: Create `use-allies.ts`** (copy the `useAsync` pattern from `showcase/use-showcase.ts` — keep it local/self-contained, no react-query):
```ts
import { useEffect, useRef, useState } from "react";
import type { AllyShowcaseItem } from "@luminova/types/engine";
import { fetchAllies } from "./ally-showcase-firestore";

type Async<T> = { data: T; loading: boolean; error: boolean };

export function useAllies(): Async<AllyShowcaseItem[]> {
  const [state, setState] = useState<Async<AllyShowcaseItem[]>>({ data: [], loading: true, error: false });
  const ranRef = useRef(false);
  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    let alive = true;
    fetchAllies()
      .then((data) => alive && setState({ data, loading: false, error: false }))
      .catch(() => alive && setState({ data: [], loading: false, error: true }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
```

- [ ] **Step 2: Replace the placeholder in `index.tsx`.** Remove:
```tsx
const ALLIES = ["Unifranz", "JCI Bolivia", "JCI Worldwide", "Cámara de Industria SC", "Fexpocruz"];
```
Add import + render. Import:
```tsx
import { useAllies } from "../allies/use-allies";
import { ALLY_CATEGORY_LABELS } from "@luminova/types/engine";
```
Replace the `ALLIES.map(...)` block with a component-driven render. Define a small local component above the route component:
```tsx
function AlliesWall() {
  const { data: allies, loading } = useAllies();
  if (loading || allies.length === 0) return null;
  return (
    <>
      {allies.map((ally) => (
        <figure key={ally.id} className="ally-card">
          <img src={ally.logoUrl} alt={ally.name} loading="lazy" className="ally-logo" />
          <figcaption className="ally-name">{ally.name}</figcaption>
          <span className="ally-chip">{ALLY_CATEGORY_LABELS[ally.category]}</span>
        </figure>
      ))}
    </>
  );
}
```
In the "Confían en nosotros" section, render `<AlliesWall />` in place of the old `.map`. (Match the existing section's class names; reuse showcase-pill styling for `.ally-chip` if present, else add minimal CSS to `styles.css`.)

- [ ] **Step 3: Add any needed CSS** to `apps/spotlight/src/styles.css` (`.ally-card`, `.ally-logo`, `.ally-name`, `.ally-chip`) — small, mirroring `.showcase-pill`/`.showcase-card` tokens.

- [ ] **Step 4: Verify** `pnpm --filter spotlight typecheck` + `pnpm --filter spotlight build`. Confirm no `getFirebase`/react-query import crept in (CI invariant).
- [ ] **Step 5: Commit** `feat(spotlight): render real allies wall, drop placeholder`

---

## Task 13: Full verification + review gate

- [ ] **Step 1:** `pnpm lint && pnpm typecheck` at root → PASS.
- [ ] **Step 2:** `pnpm pr-tests` (or per-filter `test` + the rules suites) → PASS.
- [ ] **Step 3:** `/simplify` on the diff.
- [ ] **Step 4:** `/code-review` on the diff; address findings.
- [ ] **Step 5:** `/security-review` (touches rules + Cloud Function — required).
- [ ] **Step 6:** dispatch `firestore-security-reviewer` + `firebase-functions-reviewer` + `bundle-budget-watcher`.
- [ ] **Step 7:** stamp `git commit --allow-empty -m 'chore: security-review' -m "Security-Reviewed: $(git rev-parse HEAD)"` after a clean review.
- [ ] **Step 8:** `gh pr create` (template from CLAUDE.md). Run `pnpm pr-tests` after.

---

## Self-review notes

- **Spec coverage:** types (T1), beacon projection+trigger (T2/T3), firestore.rules (T4), storage.rules (T5), firebase helper (T6), backstage mapper/repo/form/table/route (T7-T10), spotlight reader/hook/render (T11/T12), gate (T13). All spec sections mapped.
- **Type consistency:** `AllyShowcaseItem {id,name,logoUrl,category}` used identically in T1/T2/T11/T12. `projectAlly(id,data)`, `uploadAllyLogo(allyId,file)`, `setLogo(id,url)`/`clearLogo(id)`, `useSetAllyLogo`/`useRemoveAllyLogo`, `sortByName`, `fetchAllies`, `useAllies` consistent across tasks.
- **Open verifications during exec:** exact rules-test command (T11 note), `Badge` tone values (T10), storage-rules test helper names (`storageAnon`/`getBytes`) — confirm against the live files before running.
