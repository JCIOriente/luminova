# Site Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make spotlight's hardcoded org facts (stats, allies, timeline, MVV, reasons, contact) editable by the president from a backstage `/config` page, served to spotlight via a stale-while-revalidate localStorage cache, with exec-committee roles sourced from the shared CEL catalog.

**Architecture:** A world-read Firestore singleton `siteConfig/current` is hand-authored in backstage (React Hook Form + Zod, sectioned collapsible form) and read by spotlight via firestore-lite. Spotlight caches it in localStorage and paints instantly, revalidating in the background. Exec-committee roles come from a CEL catalog promoted into `@luminova/types`. Home flagship cards reuse the existing `featured` showcase items, lazy-loaded.

**Tech Stack:** TypeScript, React 19, TanStack Router, React Hook Form + Zod, Firebase (firestore + firestore/lite), `@luminova/types`, `@luminova/ui`, Vitest, `@firebase/rules-unit-testing`.

---

## ARCHITECTURE DECISION — flag in PR

The spec (approved) named TanStack Query `persistQueryClient` for the spotlight cache.
**Spotlight does not use TanStack Query** (no `@tanstack/react-query`, no provider — see
`apps/spotlight/src/main.tsx`, `package.json`). Adding it pulls the full Query runtime +
two persist packages into a minimal marketing app for a single doc.

**Decision:** implement the identical approved behavior (instant localStorage paint →
background revalidate → version-busted cache) with a zero-dependency hand-rolled SWR hook
extending the app's existing `useAsync` pattern. No new spotlight deps → no
`secure-dep-vetting` needed. Surface this deviation in the PR description for review.

## Naming convention

Schema/type keys are **English** (`stats`, `allies`, `timeline`, `mvv`, `reasons`,
`contact`); values Spanish. The Claude Design handoff uses Spanish keys
(`estadisticas`, `premioAnio`, `hitos`…) — these are UI concerns; map them to the
English schema at the form layer.

## File Structure

**Create:**
- `packages/types/src/site-config.ts` — `SiteConfig` interface (+ sub-shapes)
- `packages/types/src/site-config-schema.ts` — `siteConfigSchema` (Zod), `SiteConfigInput`
- `packages/types/src/cel-positions.ts` — `CEL_POSITIONS` shared catalog constant
- `packages/types/src/site-config.test.ts` — Zod schema tests
- `apps/backstage/src/features/site-config/repositories/site-config-repository.ts`
- `apps/backstage/src/features/site-config/repositories/site-config-mapper.ts`
- `apps/backstage/src/features/site-config/repositories/site-config-mapper.test.ts`
- `apps/backstage/src/features/site-config/hooks/site-config-keys.ts`
- `apps/backstage/src/features/site-config/hooks/use-site-config.ts`
- `apps/backstage/src/features/site-config/hooks/use-update-site-config.ts`
- `apps/backstage/src/features/site-config/components/collapsible-section.tsx`
- `apps/backstage/src/features/site-config/components/field-array-rows.tsx`
- `apps/backstage/src/features/site-config/components/site-config-form.tsx`
- `apps/backstage/src/routes/_app.config.tsx`
- `apps/spotlight/src/site-config/site-config-firestore.ts`
- `apps/spotlight/src/site-config/use-site-config.ts`
- `apps/spotlight/src/site-config/use-site-config.test.ts`
- `apps/spotlight/src/site-config/defaults.ts` — fallback values (= current hardcoded)
- `apps/spotlight/src/components/home-programs.tsx` — lazy flagship cards from showcase

**Modify:**
- `packages/types/src/index.ts` — export new modules
- `apps/backstage/src/features/positions/lib/cel-seed.ts` — re-export from types
- `firestore.rules` — add `siteConfig` match block
- `tests/firestore-rules/rules.test.ts` — add siteConfig tests
- `apps/backstage/src/components/app-sidebar.tsx` (or nav source) — add "Configuración" link
- `apps/spotlight/src/routes/index.tsx` — consume config; lazy home-programs
- `apps/spotlight/src/routes/about.tsx` — consume config; comité from CEL_POSITIONS
- `apps/spotlight/src/routes/contact.tsx` — consume config (email/location/schedule)
- `apps/spotlight/src/components/footer.tsx` — consume config (email/location/links)
- `tools/scripts/seed-emulator.mjs` + `tools/scripts/seed-production.mjs` — seed `siteConfig/current`

---

## Task 1: SiteConfig type + Zod schema (@luminova/types)

**Files:**
- Create: `packages/types/src/site-config.ts`
- Create: `packages/types/src/site-config-schema.ts`
- Create: `packages/types/src/site-config.test.ts`
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Write the interface** (`site-config.ts`)

```typescript
import type { Timestamp } from "firebase/firestore";

export interface SiteStats {
  programCount: number;
  countries: string;
  membersWorldwide: string;
  nationalAwards: number;
  efficiencyPct: number;
  standoutOrg: { year: string; title: string };
}

export interface SiteTimelineEntry {
  year: string;
  title: string;
  description: string;
}

export interface SiteReason {
  number: string;
  title: string;
  body: string;
}

export interface SiteLink {
  label: string;
  url: string;
}

export interface SiteContact {
  email: string;
  location: string;
  meetingSchedule: string;
  links: SiteLink[];
}

export interface SiteConfig {
  version: number;
  updatedAt: Timestamp;
  stats: SiteStats;
  allies: string[];
  timeline: SiteTimelineEntry[];
  mvv: { mision: string; vision: string; valores: string };
  reasons: SiteReason[];
  contact: SiteContact;
}
```

- [ ] **Step 2: Write the failing schema test** (`site-config.test.ts`)

```typescript
import { describe, expect, it } from "vitest";
import { siteConfigSchema } from "./site-config-schema";

const valid = {
  stats: {
    programCount: 5,
    countries: "100+",
    membersWorldwide: "200.000+",
    nationalAwards: 11,
    efficiencyPct: 100,
    standoutOrg: { year: "2021", title: "Organización Local Más Sobresaliente" },
  },
  allies: ["Unifranz"],
  timeline: [{ year: "1993", title: "Se funda JCI Oriente", description: "..." }],
  mvv: { mision: "m", vision: "v", valores: "x" },
  reasons: [{ number: "01", title: "Red", body: "..." }],
  contact: {
    email: "jci@example.com",
    location: "Santa Cruz",
    meetingSchedule: "Miércoles 19:30",
    links: [{ label: "JCI", url: "https://jci.cc" }],
  },
};

describe("siteConfigSchema", () => {
  it("accepts a valid config", () => {
    expect(siteConfigSchema.safeParse(valid).success).toBe(true);
  });
  it("rejects a bad email", () => {
    const r = siteConfigSchema.safeParse({ ...valid, contact: { ...valid.contact, email: "nope" } });
    expect(r.success).toBe(false);
  });
  it("rejects efficiency over 100", () => {
    const r = siteConfigSchema.safeParse({ ...valid, stats: { ...valid.stats, efficiencyPct: 101 } });
    expect(r.success).toBe(false);
  });
  it("rejects empty ally name", () => {
    const r = siteConfigSchema.safeParse({ ...valid, allies: [""] });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 3: Run it, verify it fails**

Run: `pnpm --filter @luminova/types test`
Expected: FAIL — `siteConfigSchema` not found.

- [ ] **Step 4: Write the schema** (`site-config-schema.ts`)

Note: `version`/`updatedAt` are server-managed, NOT in the input schema.

```typescript
import { z } from "zod";

const reqText = z.string().min(1, "Requerido.");
const intMin0 = z.number({ error: "Ingresa un número" }).int().min(0, "Mínimo 0");

export const siteConfigSchema = z.object({
  stats: z.object({
    programCount: intMin0,
    countries: reqText,
    membersWorldwide: reqText,
    nationalAwards: intMin0,
    efficiencyPct: z.number({ error: "Ingresa un número" }).min(0, "Mínimo 0").max(100, "Máximo 100"),
    standoutOrg: z.object({ year: reqText, title: reqText }),
  }),
  allies: z.array(z.object({ nombre: reqText })),
  timeline: z.array(z.object({ year: reqText, title: reqText, description: z.string() })),
  mvv: z.object({ mision: reqText, vision: reqText, valores: reqText }),
  reasons: z.array(z.object({ number: z.string(), title: reqText, body: z.string() })),
  contact: z.object({
    email: z.string().email("Correo no válido"),
    location: reqText,
    meetingSchedule: reqText,
    links: z.array(z.object({ label: reqText, url: reqText })),
  }),
});

export type SiteConfigInput = z.infer<typeof siteConfigSchema>;
```

> Note: `allies` uses `{ nombre }` row objects so RHF `useFieldArray` has stable keys.
> The mapper (Task 4) flattens `allies` to `string[]` for the stored doc.

- [ ] **Step 5: Export from index** (`packages/types/src/index.ts`) — append:

```typescript
export type {
  SiteConfig, SiteStats, SiteTimelineEntry, SiteReason, SiteLink, SiteContact,
} from "./site-config";
export { siteConfigSchema, type SiteConfigInput } from "./site-config-schema";
```

- [ ] **Step 6: Run test → PASS**

Run: `pnpm --filter @luminova/types test`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/types/src/site-config.ts packages/types/src/site-config-schema.ts packages/types/src/site-config.test.ts packages/types/src/index.ts
git commit -m "feat(types): SiteConfig type + Zod schema"
```

---

## Task 2: Promote CEL catalog to @luminova/types

**Files:**
- Create: `packages/types/src/cel-positions.ts`
- Modify: `apps/backstage/src/features/positions/lib/cel-seed.ts`
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Read the source** — open `apps/backstage/src/features/positions/lib/cel-seed.ts` and copy the `CEL_SEED` array verbatim.

- [ ] **Step 2: Create `cel-positions.ts`** — move the array here, exported as `CEL_POSITIONS`, typed against the existing `Position` shape (omit runtime-only fields). Use the exact 8 entries from the source (Presidente/Presidenta [Admin], Vicepresidente Ejecutivo [ExecutiveCommittee, Membership], Vicepresidente de Área [ExecutiveCommittee, Membership], Secretario [Membership], Tesorero [Treasury], Asesor Legal [ExecutiveCommittee], Pasado Presidente [ExecutiveCommittee], Asesor Presidencial [ExecutiveCommittee]).

```typescript
import type { Position } from "./position";

export type CelPositionSeed = Omit<Position, "id" | "deletedAt" | "active" | "term"> & {
  term: number | null;
};

export const CEL_POSITIONS: CelPositionSeed[] = [
  // ...exact entries copied from cel-seed.ts...
];
```

> Keep the exact field shape the original `CEL_SEED` used so backstage's seeding hook is unaffected.

- [ ] **Step 3: Re-export from backstage** — replace the array in `cel-seed.ts` with:

```typescript
export { CEL_POSITIONS as CEL_SEED } from "@luminova/types";
```

(If `cel-seed.ts` had local helpers, keep them; only the data array moves.)

- [ ] **Step 4: Export from types index** — append to `packages/types/src/index.ts`:

```typescript
export { CEL_POSITIONS, type CelPositionSeed } from "./cel-positions";
```

- [ ] **Step 5: Typecheck both packages**

Run: `pnpm --filter @luminova/types typecheck && pnpm --filter backstage typecheck`
Expected: PASS. Verify `use-seed-positions` (the consumer) still resolves `CEL_SEED`.

- [ ] **Step 6: Commit**

```bash
git add packages/types/src/cel-positions.ts packages/types/src/index.ts apps/backstage/src/features/positions/lib/cel-seed.ts
git commit -m "refactor(types): promote CEL catalog to shared package"
```

---

## Task 3: firestore.rules — siteConfig block + tests

**Files:**
- Modify: `firestore.rules`
- Modify: `tests/firestore-rules/rules.test.ts`

- [ ] **Step 1: Write failing rules tests** — add a `describe("firestore.rules — siteConfig")` block to `rules.test.ts`. Seed a `siteConfig/current` doc in the `withSecurityRulesDisabled` block first:

```typescript
await setDoc(doc(db, "siteConfig/current"), { version: 1, stats: {}, allies: [] });
```

Tests:

```typescript
describe("firestore.rules — siteConfig", () => {
  it("allows anonymous read (public site)", async () => {
    await assertSucceeds(getDoc(doc(anon(), "siteConfig/current")));
  });
  it("denies anonymous write", async () => {
    await assertFails(setDoc(doc(anon(), "siteConfig/current"), { version: 2 }));
  });
  it("denies non-admin signed-in write", async () => {
    await assertFails(setDoc(doc(as("u", ["Membership"]), "siteConfig/current"), { version: 2 }));
  });
  it("allows Admin write", async () => {
    await assertSucceeds(
      setDoc(doc(as("admin", ["Admin"]), "siteConfig/current"), { version: 2, stats: {}, allies: [] }),
    );
  });
});
```

- [ ] **Step 2: Run → FAIL**

Run: `pnpm --filter firestore-rules test`
Expected: FAIL (no siteConfig rule → default deny → public-read test fails).

- [ ] **Step 3: Add the rule** — in `firestore.rules`, alongside the `showcase` block:

```
match /siteConfig/{doc} {
  allow read: if true;
  allow write: if hasAnyRole(['Admin']);
}
```

- [ ] **Step 4: Run → PASS**

Run: `pnpm --filter firestore-rules test`
Expected: PASS (all siteConfig tests + existing suite green).

- [ ] **Step 5: Commit**

```bash
git add firestore.rules tests/firestore-rules/rules.test.ts
git commit -m "feat(rules): siteConfig public-read, admin-write"
```

---

## Task 4: backstage repository + mapper

**Files:**
- Create: `apps/backstage/src/features/site-config/repositories/site-config-repository.ts`
- Create: `apps/backstage/src/features/site-config/repositories/site-config-mapper.ts`
- Create: `apps/backstage/src/features/site-config/repositories/site-config-mapper.test.ts`

- [ ] **Step 1: Write failing mapper tests** — the mapper converts `SiteConfigInput` (form shape, `allies: {nombre}[]`) → stored doc shape (`allies: string[]`) and back.

```typescript
import { describe, expect, it } from "vitest";
import { toSiteConfigDoc, toSiteConfigInput } from "./site-config-mapper";
import type { SiteConfig } from "@luminova/types";

const input = {
  stats: { programCount: 5, countries: "100+", membersWorldwide: "200.000+", nationalAwards: 11, efficiencyPct: 100, standoutOrg: { year: "2021", title: "OLM" } },
  allies: [{ nombre: "Unifranz" }],
  timeline: [{ year: "1993", title: "Fundación", description: "d" }],
  mvv: { mision: "m", vision: "v", valores: "x" },
  reasons: [{ number: "01", title: "Red", body: "b" }],
  contact: { email: "a@b.com", location: "SC", meetingSchedule: "Mié", links: [{ label: "JCI", url: "https://jci.cc" }] },
};

describe("site-config mapper", () => {
  it("flattens allies to strings for the doc", () => {
    expect(toSiteConfigDoc(input, 3).allies).toEqual(["Unifranz"]);
  });
  it("bumps the version", () => {
    expect(toSiteConfigDoc(input, 3).version).toBe(4);
  });
  it("round-trips allies back to row objects", () => {
    const doc = { version: 4, allies: ["Unifranz"], stats: input.stats, timeline: input.timeline, mvv: input.mvv, reasons: input.reasons, contact: input.contact } as unknown as SiteConfig;
    expect(toSiteConfigInput(doc).allies).toEqual([{ nombre: "Unifranz" }]);
  });
});
```

- [ ] **Step 2: Run → FAIL** — `pnpm --filter backstage test` → mapper not found.

- [ ] **Step 3: Write the mapper** (`site-config-mapper.ts`)

```typescript
import { serverTimestamp } from "firebase/firestore";
import type { SiteConfig, SiteConfigInput } from "@luminova/types";

export function toSiteConfigDoc(data: SiteConfigInput, currentVersion: number) {
  return {
    version: currentVersion + 1,
    updatedAt: serverTimestamp(),
    stats: data.stats,
    allies: data.allies.map((a) => a.nombre),
    timeline: data.timeline,
    mvv: data.mvv,
    reasons: data.reasons,
    contact: data.contact,
  };
}

export function toSiteConfigInput(doc: SiteConfig): SiteConfigInput {
  return {
    stats: doc.stats,
    allies: doc.allies.map((nombre) => ({ nombre })),
    timeline: doc.timeline,
    mvv: doc.mvv,
    reasons: doc.reasons,
    contact: doc.contact,
  };
}
```

- [ ] **Step 4: Write the repository** (`site-config-repository.ts`)

```typescript
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFirebase } from "@luminova/firebase";
import type { SiteConfig, SiteConfigInput } from "@luminova/types";
import { toSiteConfigDoc } from "./site-config-mapper";

const DOC_PATH = "current";

export class SiteConfigRepository {
  private readonly ref = doc(getFirebase().db, "siteConfig", DOC_PATH);

  async get(): Promise<SiteConfig | null> {
    const snap = await getDoc(this.ref);
    return snap.exists() ? (snap.data() as SiteConfig) : null;
  }

  async update(data: SiteConfigInput, currentVersion: number): Promise<void> {
    await setDoc(this.ref, toSiteConfigDoc(data, currentVersion), { merge: true });
  }
}
```

- [ ] **Step 5: Run → PASS** — `pnpm --filter backstage test`

- [ ] **Step 6: Commit**

```bash
git add apps/backstage/src/features/site-config/repositories/
git commit -m "feat(backstage): siteConfig repository + mapper"
```

---

## Task 5: backstage hooks

**Files:**
- Create: `apps/backstage/src/features/site-config/hooks/site-config-keys.ts`
- Create: `apps/backstage/src/features/site-config/hooks/use-site-config.ts`
- Create: `apps/backstage/src/features/site-config/hooks/use-update-site-config.ts`

- [ ] **Step 1: keys**

```typescript
export const siteConfigKeys = { current: ["siteConfig"] as const };
```

- [ ] **Step 2: query hook**

```typescript
import { useQuery } from "@tanstack/react-query";
import { SiteConfigRepository } from "../repositories/site-config-repository";
import { siteConfigKeys } from "./site-config-keys";

export function useSiteConfig() {
  return useQuery({
    queryKey: siteConfigKeys.current,
    queryFn: () => new SiteConfigRepository().get(),
  });
}
```

- [ ] **Step 3: mutation hook** (takes the current version to bump)

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SiteConfigInput } from "@luminova/types";
import { SiteConfigRepository } from "../repositories/site-config-repository";
import { siteConfigKeys } from "./site-config-keys";

export function useUpdateSiteConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ data, version }: { data: SiteConfigInput; version: number }) =>
      new SiteConfigRepository().update(data, version),
    onSettled: () => queryClient.invalidateQueries({ queryKey: siteConfigKeys.current }),
  });
}
```

- [ ] **Step 4: Typecheck** — `pnpm --filter backstage typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/features/site-config/hooks/
git commit -m "feat(backstage): siteConfig query + mutation hooks"
```

---

## Task 6: backstage form components

Build per the Claude Design handoff (`design_handoff_configuracion_sitio/`), using `@luminova/ui` primitives (`Field`, `Input`, `Textarea`, `Button`, `IconButton`, `Icon`, `Badge`, `cn`). Drop the Comité section. Map Spanish UI labels → English schema keys.

**Files:**
- Create: `apps/backstage/src/features/site-config/components/collapsible-section.tsx`
- Create: `apps/backstage/src/features/site-config/components/field-array-rows.tsx`
- Create: `apps/backstage/src/features/site-config/components/site-config-form.tsx`

- [ ] **Step 1: `CollapsibleSection`** — header button (`aria-expanded` + `aria-controls`, number + icon + title + desc + count pill + chevron), body revealed on toggle. Tailwind utilities matching the handoff's `.collapse*` (see README token values). Props: `{ num, icon, title, desc, count?, defaultOpen?, children }`.

- [ ] **Step 2: `FieldArrayRows`** — generic row list backed by RHF `useFieldArray` (`fields`, `append`, `remove`, `move`). Each row: up/down `IconButton` (disabled at ends, `aria-label` "Subir/Bajar {noun} {i+1}"), delete `IconButton` (danger, `aria-label` "Eliminar {noun} {i+1}"), and a `renderRow(index)` slot. "+ Agregar {noun}" appends a blank. Keyboard-operable; pointer drag is optional/decorative.

- [ ] **Step 3: `SiteConfigForm`** — `useForm<SiteConfigInput>({ resolver: zodResolver(siteConfigSchema), defaultValues })`. Five `CollapsibleSection`s (01 Estadísticas, 02 Aliados, 03 Hitos, 04 Misión·Visión·Valores, 05 Razones, 06 Contacto — renumber after dropping Comité). `useFieldArray` for `allies`, `timeline`, `reasons`, `contact.links`. Native inputs via `register`; numeric stats with `register(..., { valueAsNumber: true })`. Sticky save bar: status dot + dirty/error text (`formState.isDirty`, count `Object.keys(errors).length`), `Descartar` (reset) + `Guardar cambios` (submit, disabled when `!isDirty`). Errors surface after first submit attempt. Last-saved stamp via `Intl.DateTimeFormat('es-BO', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })`. Props: `{ defaultValues, lastSaved, onSubmit }`.

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm --filter backstage typecheck && pnpm --filter backstage lint`
Expected: PASS. (react-best-practices auto-applies on .tsx.)

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/features/site-config/components/
git commit -m "feat(backstage): siteConfig sectioned form components"
```

---

## Task 7: backstage route + nav

**Files:**
- Create: `apps/backstage/src/routes/_app.config.tsx`
- Modify: nav source (`apps/backstage/src/components/app-sidebar.tsx` — confirm exact file)

- [ ] **Step 1: Route** — `createFileRoute("/_app/config")`. Component: `useSiteConfig()` → loading/error states (`Skeleton`/`EmptyState`); on data, render page header (eyebrow "Capítulo JCI Oriente", h1 "Configuración", subtitle) + `SiteConfigForm` with `defaultValues={toSiteConfigInput(data)}`. `onSubmit` calls `useUpdateSiteConfig().mutateAsync({ data, version: data.version })` then `Toast` success. If `data` is null (unseeded), pass `SITE_CONFIG_DEFAULTS` mapped through `toSiteConfigInput` (version 0). No "Preferencias" tab (out of scope) — omit the SegmentedControl.

- [ ] **Step 2: Nav link** — add a "Configuración" entry (Icon `settings`/`gear`) pointing to `/config`, placed with the other admin sections. Match the existing nav item shape.

- [ ] **Step 3: Run app, verify route loads**

Run (separate terminal): emulators + `pnpm --filter backstage dev`; visit `/config`.
Expected: form renders, sections expand/collapse, save persists (check emulator UI `siteConfig/current`, version bumped).

- [ ] **Step 4: Typecheck + commit**

```bash
pnpm --filter backstage typecheck
git add apps/backstage/src/routes/_app.config.tsx apps/backstage/src/components/app-sidebar.tsx apps/backstage/src/routeTree.gen.ts
git commit -m "feat(backstage): /config route + nav entry"
```

---

## Task 8: spotlight reader + SWR localStorage hook

**Files:**
- Create: `apps/spotlight/src/site-config/defaults.ts`
- Create: `apps/spotlight/src/site-config/site-config-firestore.ts`
- Create: `apps/spotlight/src/site-config/use-site-config.ts`
- Create: `apps/spotlight/src/site-config/use-site-config.test.ts`

- [ ] **Step 1: `defaults.ts`** — export `SITE_CONFIG_DEFAULTS` matching the CURRENT hardcoded spotlight values (programCount 5, countries "100+", membersWorldwide "200.000+", nationalAwards 11, efficiencyPct 100, standoutOrg {2021, "Organización Local Más Sobresaliente"}, the 5 allies, the 7 timeline hitos, MVV texts, 3 reasons, contact email/location/schedule, footer links). Shape: a plain `Omit<SiteConfig, "version" | "updatedAt">`. This is the fallback when fetch fails AND the production seed source (Task 11 imports it).

- [ ] **Step 2: reader** (`site-config-firestore.ts`)

```typescript
import { doc, getDoc } from "firebase/firestore/lite";
import { getFirestoreLite } from "@luminova/firebase";
import type { SiteConfig } from "@luminova/types";

export async function fetchSiteConfig(): Promise<SiteConfig | null> {
  const db = getFirestoreLite();
  const snap = await getDoc(doc(db, "siteConfig", "current"));
  return snap.exists() ? (snap.data() as SiteConfig) : null;
}
```

- [ ] **Step 3: Write failing hook test** (`use-site-config.test.ts`) — test the pure cache helpers (`readCache`/`writeCache`) with a localStorage mock.

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { readCache, writeCache, CACHE_KEY } from "./use-site-config";

function mockStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  });
  return store;
}

afterEach(() => vi.unstubAllGlobals());

describe("site-config cache", () => {
  it("returns null when empty", () => {
    mockStorage();
    expect(readCache()).toBeNull();
  });
  it("round-trips written config", () => {
    mockStorage();
    const cfg = { stats: { programCount: 5 } } as never;
    writeCache(cfg);
    expect(readCache()).toEqual(cfg);
  });
  it("returns null on corrupt JSON", () => {
    const store = mockStorage();
    store.set(CACHE_KEY, "{not json");
    expect(readCache()).toBeNull();
  });
});
```

- [ ] **Step 4: Run → FAIL** — `pnpm --filter spotlight test`.

- [ ] **Step 5: Write the hook** (`use-site-config.ts`) — instant localStorage paint + background revalidate. Zero new deps.

```typescript
import { useEffect, useState } from "react";
import type { SiteConfig } from "@luminova/types";
import { fetchSiteConfig } from "./site-config-firestore";
import { SITE_CONFIG_DEFAULTS } from "./defaults";

export const CACHE_KEY = "jci.siteConfig.v1";

type Resolved = Omit<SiteConfig, "version" | "updatedAt">;

export function readCache(): Resolved | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Resolved) : null;
  } catch {
    return null;
  }
}

export function writeCache(config: Resolved): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(config));
  } catch {
    /* quota / private mode — ignore, fall back to network each load */
  }
}

export function useSiteConfig(): Resolved {
  const [config, setConfig] = useState<Resolved>(() => readCache() ?? SITE_CONFIG_DEFAULTS);

  useEffect(() => {
    let alive = true;
    fetchSiteConfig()
      .then((fresh) => {
        if (!alive || !fresh) return;
        const resolved: Resolved = {
          stats: fresh.stats, allies: fresh.allies, timeline: fresh.timeline,
          mvv: fresh.mvv, reasons: fresh.reasons, contact: fresh.contact,
        };
        setConfig(resolved);
        writeCache(resolved);
      })
      .catch(() => {
        /* keep cached/default on failure */
      });
    return () => {
      alive = false;
    };
  }, []);

  return config;
}
```

> SWR behavior: first paint uses cache (or defaults) with zero network wait; the
> background read overwrites cache + state when fresh data lands. `CACHE_KEY` carries a
> schema-version suffix (`v1`) — bump it if the stored shape changes, which discards
> incompatible old caches (the buster).

- [ ] **Step 6: Run → PASS** — `pnpm --filter spotlight test`.

- [ ] **Step 7: Commit**

```bash
git add apps/spotlight/src/site-config/
git commit -m "feat(spotlight): siteConfig reader + SWR localStorage hook"
```

---

## Task 9: wire spotlight pages to config

**Files:**
- Modify: `apps/spotlight/src/routes/index.tsx`
- Modify: `apps/spotlight/src/routes/about.tsx`
- Modify: `apps/spotlight/src/routes/contact.tsx`
- Modify: `apps/spotlight/src/components/footer.tsx`

- [ ] **Step 1: index.tsx** — call `const config = useSiteConfig();`. Replace the hero/impact stat literals with config values: `+{currentYearsActive()}` for years (computed, Step 5), `{config.stats.programCount}` programas, `{config.stats.countries}` países, `{config.stats.membersWorldwide}` miembros, `+{config.stats.nationalAwards}` reconocimientos, `{config.stats.efficiencyPct}%`, standoutOrg year/title. Replace `ALLIES` const usage with `config.allies`.

- [ ] **Step 2: about.tsx** — `useSiteConfig()`. Replace `TIMELINE` const with `config.timeline`; MVV blocks with `config.mvv`; `REASONS` with `config.reasons`. Replace `COMITE` const with CEL titles: `import { CEL_POSITIONS } from "@luminova/types"` → `CEL_POSITIONS.map((p) => p.title)` (this fixes the existing drift where the hardcoded list didn't match the real catalog).

- [ ] **Step 3: contact.tsx** — `useSiteConfig()`. Replace email/location/meetingSchedule literals with `config.contact.*`.

- [ ] **Step 4: footer.tsx** — `useSiteConfig()`. Replace email/location literals + link URLs with `config.contact.email`/`.location`/`.links`.

- [ ] **Step 5: yearsActive helper** — founding year stays a code constant. Add to `apps/spotlight/src/site-config/defaults.ts`:

```typescript
export const FOUNDING_YEAR = 1993;
export function currentYearsActive(now = new Date()): number {
  return now.getFullYear() - FOUNDING_YEAR;
}
```

Use `currentYearsActive()` wherever "+32" appeared.

- [ ] **Step 6: Typecheck + build + manual check**

Run: `pnpm --filter spotlight typecheck && pnpm --filter spotlight build`
Expected: PASS. With emulators + seeded config, run dev and confirm pages render config values, and that editing in backstage → reload spotlight reflects the change.

- [ ] **Step 7: Commit**

```bash
git add apps/spotlight/src/routes/index.tsx apps/spotlight/src/routes/about.tsx apps/spotlight/src/routes/contact.tsx apps/spotlight/src/components/footer.tsx apps/spotlight/src/site-config/defaults.ts
git commit -m "feat(spotlight): drive org facts from siteConfig + CEL catalog"
```

---

## Task 10: lazy-loaded home flagship cards from showcase

**Files:**
- Create: `apps/spotlight/src/components/home-programs.tsx`
- Modify: `apps/spotlight/src/routes/index.tsx`

- [ ] **Step 1: `home-programs.tsx`** — a component that calls `useFeaturedList()` (existing hook) and renders the "Cinco programas" cards from `featured` showcase items (title, area/tag, description, photo). Loading → `Skeleton` placeholders. Keep the existing card visual.

- [ ] **Step 2: Lazy-mount in index.tsx** — replace the inline `PROGRAMS` array section with:

```typescript
import { lazy, Suspense } from "react";
const HomePrograms = lazy(() => import("../components/home-programs"));
// ...in the programs section:
<Suspense fallback={<ProgramsSkeleton />}>
  <HomePrograms />
</Suspense>
```

`home-programs.tsx` must `export default`. This code-splits the showcase-reading cards so they don't block initial paint.

- [ ] **Step 3: Remove the now-dead `PROGRAMS` const** from index.tsx (knip will flag if left).

- [ ] **Step 4: Typecheck + build** — `pnpm --filter spotlight typecheck && pnpm --filter spotlight build`. Confirm a separate chunk is emitted for home-programs.

- [ ] **Step 5: Commit**

```bash
git add apps/spotlight/src/components/home-programs.tsx apps/spotlight/src/routes/index.tsx
git commit -m "feat(spotlight): lazy home flagship cards from featured showcase"
```

---

## Task 11: seed siteConfig/current

**Files:**
- Modify: `tools/scripts/seed-emulator.mjs`
- Modify: `tools/scripts/seed-production.mjs`

- [ ] **Step 1: Inspect** both seed scripts for their existing doc-write pattern (admin SDK vs client). Match it.

- [ ] **Step 2: Add a `siteConfig/current` seed doc** with `version: 1`, `updatedAt` (server/admin timestamp), and the current hardcoded values (same data as `SITE_CONFIG_DEFAULTS`). Keep the literal here in JS form (the .mjs scripts can't import the TS defaults). Allies as `string[]`.

- [ ] **Step 3: Run emulator seed**

Run: `pnpm seed:emulator`
Expected: no errors; `siteConfig/current` present in emulator UI.

- [ ] **Step 4: Verify seed tests** (if `test:seed` covers it) — `pnpm test:seed`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/scripts/seed-emulator.mjs tools/scripts/seed-production.mjs
git commit -m "chore(seed): siteConfig/current default content"
```

---

## Task 12: verification + review gate

- [ ] **Step 1: Full PR test suite**

Run: `pnpm pr-tests`
Expected: format clean, all `ci` green, knip clean (no dead `PROGRAMS`/`ALLIES`/`COMITE`/`TIMELINE`/`REASONS` consts left), audit ≤ high passes, seed tests pass.

- [ ] **Step 2: `/simplify`** on the diff (post-feature cleanup).

- [ ] **Step 3: `/security-review`** on the branch (REQUIRED — touches `firestore.rules` + a new world-read collection). Then stamp `Security-Reviewed: <sha>` trailer per the gate hook.

- [ ] **Step 4: Dispatch `firestore-security-reviewer`** (touches rules + a new collection) and `bundle-budget-watcher` (spotlight added a route + lazy chunk; confirm no TanStack Query crept into the bundle). Address findings.

- [ ] **Step 5: `/code-review`** (high) on the diff. Pay attention to CREATE/UPDATE rule parity for siteConfig and any value-trust issues. Apply confirmed findings.

- [ ] **Step 6: Open PR** — `gh pr create` with the body template. Call out in Summary: (a) the persistQueryClient → hand-rolled SWR deviation, (b) Comité now sourced from CEL catalog (fixes prior drift), (c) home programs lazy-loaded from showcase. Run `pnpm pr-tests` once more after opening.

---

## Self-review (spec coverage)

- Stats 1–7 → Tasks 1, 8 (defaults), 9 (wiring), 11 (seed). ✓
- Allies/timeline/MVV/reasons editable → Tasks 1, 6, 9. ✓
- Contact/org → Tasks 1, 6, 9 (footer + contact). ✓
- Comité from CEL catalog → Tasks 2, 9 (about). ✓
- Programs reuse featured showcase, lazy → Task 10. ✓
- yearsActive computed → Task 9 Step 5. ✓
- Singleton doc, version buster, public-read/admin-write → Tasks 1, 3, 4. ✓
- SWR localStorage cache → Task 8 (hand-rolled, deviation flagged). ✓
- Review gate (rules → security-review, firestore-security-reviewer, simplify, code-review, bundle) → Task 12. ✓
