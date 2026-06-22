# Public Allies — Design

**Date:** 2026-06-21
**Branch:** `feat/public-allies`
**Status:** Approved (brainstorm)

## Goal

Show **real allies** on the public spotlight home wall ("Confían en nosotros"):
each ally as **name + logo + category chip**. Replace the placeholder constant
`ALLIES` in `apps/spotlight/src/routes/index.tsx` (added by PR #82).

## Why this is multi-boundary

The existing `Ally` (`packages/types/src/ally.ts`) is an **admin CRM record**
(`companyName, contactPerson, phone, email`) — auth-gated (firestore.rules
`/allies`), no logo, no category. The public site is no-auth and may only read
world-readable collections via `getFirestoreLite()`. So the public surface must be
a **separate, curated world-read projection** that exposes only public fields —
mirroring the `showcase` precedent (C4 / PR #66, programas-impacto / PR #77).

## Decisions (brainstorm)

1. **4 categories**, English keys / Spanish labels.
2. **Beacon projection** `allyShowcase` (not opening `allies` read — that leaks
   contactPerson/phone/email).
3. **PNG + JPEG** logos (own storage validator; existing `isValidPhoto` is JPEG-only).
4. **Flat grid + category chip** render (matches showcase pill aesthetic).
5. **Optional fields, project only complete** — `logoUrl`/`category` optional on
   `Ally`; the projection skips allies missing either. No migration.

## Category taxonomy

| Key (English) | Label (Spanish) |
|---|---|
| `University` | Universidades |
| `PublicInstitution` | Instituciones públicas |
| `Organization` | Organizaciones |
| `Company` | Empresas |

## Data model

### Types (`packages/types`)

New `engine/ally-public.ts` (pure, zod-free — beacon reaches only the `/engine`
subpath; precedent: `showcase.ts` lives here too):

```ts
export const ALLY_CATEGORIES = ["University", "PublicInstitution", "Organization", "Company"] as const;
export type AllyCategory = (typeof ALLY_CATEGORIES)[number];
export const ALLY_CATEGORY_LABELS: Record<AllyCategory, string> = {
  University: "Universidades",
  PublicInstitution: "Instituciones públicas",
  Organization: "Organizaciones",
  Company: "Empresas",
};
/** Curated public projection of an ally. Beacon writes; world-read. */
export interface AllyShowcaseItem {
  id: string;
  name: string;        // = companyName
  logoUrl: string;     // https only
  category: AllyCategory;
}
```

`Ally` gains two backfill-safe fields:

```ts
logoUrl: string | null;
category: AllyCategory | null;
```

`ally-schema.ts` adds `category: z.enum(ALLY_CATEGORIES).optional()`. `logoUrl` is
**not** in the form schema — the logo is uploaded out-of-band (like initiative
photos) and written via a dedicated repo method, not the create/update payload.

### Firestore collections

- `allies/{id}` — admin CRM, **stays auth-gated** (unchanged rules).
- `allyShowcase/{id}` — **new**, world-read / beacon-write-only. Doc shape =
  `AllyShowcaseItem`.

## Beacon — `onAllyWritten`

New `apps/beacon/src/showcase/project-ally.ts`:

```ts
export function projectAlly(id: string, data: Record<string, unknown>): AllyShowcaseItem | null {
  if (data.active !== true || data.deletedAt != null) return null;
  const name = data.companyName;
  if (typeof name !== "string" || name.length === 0) return null;
  const logoUrl = data.logoUrl;
  if (typeof logoUrl !== "string" || !logoUrl.startsWith("https://")) return null;  // public <img> — https only
  const category = data.category;
  if (!ALLY_CATEGORIES.includes(category as AllyCategory)) return null;
  return { id, name, logoUrl, category: category as AllyCategory };
}
```

Trigger in `index.ts` (mirrors the `projectShowcase` set/delete shape):

```ts
export const onAllyWritten = onDocumentWritten("allies/{id}", async (event) => {
  const ref = db().doc(`allyShowcase/${event.params.id}`);
  const after = event.data?.after;
  const item = after?.exists ? projectAlly(event.params.id, after.data()) : null;
  if (!item) { await ref.delete(); return; }   // ineligible/deleted → reconcile away
  await ref.set(item);
});
```

Idempotent (deterministic id, full set/delete). The `https://` guard is the same
public-img discipline as `showcasePerson`.

## Rules

### `firestore.rules` (after the `showcase` block)

```
match /allyShowcase/{id} {
  allow read: if true;
  allow write: if false;
}
```

### `storage.rules`

```
function isValidLogo() {
  return request.resource.contentType in ['image/png', 'image/jpeg']
    && request.resource.size <= 2 * 1024 * 1024;
}
match /allies/{id}/logo {
  allow read: if true;                              // public site renders the logo
  allow create, update: if isPrivileged() && isValidLogo();
  allow delete: if isPrivileged();                  // NOT gated on request.resource (null on delete)
}
```

`isPrivileged()` (Admin/Membership) already matches who may write `allies`. The
logo blob is **world-read** — required so the no-auth spotlight can `<img>` it
(approved). Delete is split off `isValidLogo` (request.resource is null on delete).

## Storage helper (`packages/firebase`)

New `ally-logo.ts`, raw-file upload (no crop/re-encode — preserves PNG transparency
and aspect):

```ts
export function uploadAllyLogo(allyId: string, file: File): Promise<string>;  // path allies/{id}/logo, contentType = file.type
export function deleteAllyLogo(allyId: string): Promise<void>;                // swallows object-not-found
```

Path `allies/${allyId}/logo` (no extension; contentType metadata drives it; stable
path → overwrite-on-replace, deterministic delete).

## Backstage

- **`ally-mapper.ts`** — add `category` to `editableFields` (undefined → store
  `null`); `toAllyCreateDoc` defaults `logoUrl: null`.
- **`ally-repository.ts`** — `setLogo(id, url)` / `clearLogo(id)`
  (`updateDoc({ logoUrl })`). `getAll`/`getById` already spread the full doc.
- **`ally-form.tsx`** — add category `<select>` (always). Accept optional `ally`,
  `onUploadLogo`, `onRemoveLogo`; render a local **`LogoUploader`** only in edit
  mode (id known). Create mode shows a hint: save first, then add the logo.
- **`logo-uploader.tsx`** (new, local) — file input `accept="image/png,image/jpeg"`,
  validates type + ≤2 MB, previews `currentSrc`, calls `onUpload(file)` / `onRemove`.
- **`ally-table.tsx`** — add a logo thumbnail + category chip column.
- **route `_app.allies.tsx`** — wire `onUploadLogo` (uploadAllyLogo → setLogo →
  invalidate) and `onRemoveLogo` (deleteAllyLogo → clearLogo → invalidate) via new
  `use-set-ally-logo` / `use-remove-ally-logo` hooks.

## Spotlight

- **`allies/ally-showcase-firestore.ts`** — firestore-lite reader:
  `fetchAllies(): Promise<AllyShowcaseItem[]>` (read `allyShowcase`, sort by name).
- **`allies/use-allies.ts`** — `useAllies()` via the same `useAsync` pattern as
  `use-showcase.ts` (no react-query, no `getFirebase` — CI-enforced).
- **`routes/index.tsx`** — drop the `ALLIES` const; render a flat logo grid, each
  card showing the logo (`<img alt={name}>`) + a small category chip. Empty/loading
  states; hide section when zero allies.

## Testing (TDD)

| Unit | Test |
|---|---|
| `engine/ally-public` labels/enum | type-level + a label-map test |
| `ally-schema` category optional + invalid rejected | `ally-schema.test.ts` |
| `projectAlly` eligibility matrix | `project-ally.test.ts` (beacon vitest) — the core logic |
| `ally-mapper` category + logoUrl default | `ally-mapper.test.ts` (if present) |
| `ally-showcase-firestore` sort | spotlight vitest |
| firestore.rules `allyShowcase` world-read / write:false | `tests/firestore-rules/rules.test.ts` |
| storage.rules `allies/{id}/logo` read/write/delete + bad type | `tests/storage-rules/rules.test.ts` |
| `LogoUploader` validate/upload | component test |
| `ally-form` category select | extend `ally-form.test.tsx` |

## Review gate (required — touches rules + a Cloud Function)

`/simplify` → `/code-review` → `/security-review` → `firestore-security-reviewer`
→ `firebase-functions-reviewer` → `bundle-budget-watcher`. Stamp
`Security-Reviewed: <sha>` trailer before `gh pr create`. Run rules tests against
the live emulator if `pnpm dev` is up (emulators:exec port collision is a known
gotcha).

## Out of scope (YAGNI)

- No ordering/featured flag on allies (alphabetical by name).
- No per-ally public detail page (logo wall only).
- No 5th category; enum is extensible later.
