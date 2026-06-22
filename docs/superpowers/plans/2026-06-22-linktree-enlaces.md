# Linktree `/enlaces` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a president-editable link-aggregator page at spotlight `/enlaces`, with its data living in the existing `siteConfig.linktree` section edited from backstage `/config`.

**Architecture:** Additive only. Extend the `SiteConfig` type + Zod schema with a `linktree` section; backstage edits it through the existing site-config form/mapper; spotlight reads it via the existing `useSiteConfig` localStorage-SWR hook and renders a new `/enlaces` route. No Cloud Function, no `firestore.rules` change (the `siteConfig/current` doc is already world-read + Admin-write), no new dependency (icons come from the bespoke `@luminova/ui` `Icon` set; ripple from `RippleBackground`).

**Tech Stack:** React 19, TypeScript strict, Zod 4, React Hook Form, TanStack Router (file-based), Tailwind v4, `@luminova/ui`, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-22-linktree-enlaces-design.md`

---

## File Structure

**packages/types**
- `src/site-config.ts` (modify) — add `LINKTREE_ICONS`, `LINKTREE_SOCIAL_PLATFORMS` consts + `LinktreeIcon`, `LinktreeSocialPlatform`, `LinktreeLink`, `LinktreeSocial`, `SiteLinktree` types; add optional `linktree?` to `SiteConfig`.
- `src/site-config-schema.ts` (modify) — widen `safeUrl` for `mailto:`; add required `linktree` to `siteConfigSchema`.
- `src/site-config.test.ts` (modify) — extend `valid` fixture with `linktree`; add linktree + mailto cases.
- `src/index.ts` (modify) — export the new consts + types.

**apps/backstage**
- `src/features/site-config/repositories/site-config-mapper.ts` (modify) — round-trip `linktree`, generate ids, normalize socials, default when a stored doc lacks the section.
- `src/features/site-config/repositories/site-config-mapper.test.ts` (modify) — extend `input` fixture + add linktree round-trip / default cases.
- `src/features/site-config/components/site-config-form.tsx` (modify) — add "Enlaces (Linktree)" `CollapsibleSection`.

**apps/spotlight**
- `src/site-config/safe-href.ts` (create) — shared runtime href neutralizer.
- `src/site-config/safe-href.test.ts` (create) — unit tests.
- `src/site-config/defaults.ts` (modify) — add `linktree` default.
- `src/site-config/use-site-config.ts` (modify) — add `linktree` to the `Resolved` literal.
- `src/routes/enlaces.tsx` (create) — the public `/enlaces` page + icon map.
- `src/routes/enlaces.test.tsx` (create) — render test.
- `src/components/footer.tsx` (modify) — use shared `safeHref`; add "Enlaces" nav item.
- `src/styles.css` (modify) — link-card hover utility classes.

---

## Task 1: Types — linktree shapes

**Files:**
- Modify: `packages/types/src/site-config.ts`
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Add consts + types to `site-config.ts`**

Append to `packages/types/src/site-config.ts` (after `SiteLink`, before `SiteContact`):

```ts
export const LINKTREE_ICONS = [
  "user",
  "globe",
  "folder",
  "calendar",
  "mail",
  "megaphone",
  "handshake",
  "heart",
  "target",
  "compass",
  "briefcase",
  "spark",
] as const;
export type LinktreeIcon = (typeof LINKTREE_ICONS)[number];

export const LINKTREE_SOCIAL_PLATFORMS = ["instagram", "facebook", "tiktok"] as const;
export type LinktreeSocialPlatform = (typeof LINKTREE_SOCIAL_PLATFORMS)[number];

export interface LinktreeLink {
  id: string;
  icon: LinktreeIcon;
  title: string;
  description: string;
  url: string;
  isPrimary: boolean;
  badge?: string;
  active: boolean;
}

export interface LinktreeSocial {
  platform: LinktreeSocialPlatform;
  url: string;
}

export interface SiteLinktree {
  handle: string;
  tagline: string;
  taglineAccent: string;
  links: LinktreeLink[];
  socials: LinktreeSocial[];
}
```

- [ ] **Step 2: Add the optional field to `SiteConfig`**

In the same file, add `linktree` to the `SiteConfig` interface (optional, for back-compat with stored docs written before this feature):

```ts
export interface SiteConfig {
  version: number;
  updatedAt: Timestamp;
  stats: SiteStats;
  timeline: SiteTimelineEntry[];
  mvv: { mision: string; vision: string; valores: string };
  reasons: SiteReason[];
  contact: SiteContact;
  linktree?: SiteLinktree;
}
```

- [ ] **Step 3: Export from the barrel**

In `packages/types/src/index.ts`, replace the `site-config.js` type export block with:

```ts
export type {
  SiteConfig,
  SiteStats,
  SiteTimelineEntry,
  SiteReason,
  SiteLink,
  SiteContact,
  SiteLinktree,
  LinktreeLink,
  LinktreeSocial,
  LinktreeIcon,
  LinktreeSocialPlatform,
} from "./site-config.js";
export {
  LINKTREE_ICONS,
  LINKTREE_SOCIAL_PLATFORMS,
} from "./site-config.js";
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @luminova/types typecheck`
Expected: PASS (no usages yet; types compile).

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/site-config.ts packages/types/src/index.ts
git commit --no-verify -m "feat(types): linktree shapes on SiteConfig"
```

> Note: use `--no-verify` on every commit in this plan. The repo's pre-commit hook fmt-fixes and re-stages **all** dirty files in the shared working tree, which would sweep unrelated WIP into your commit. Bypassing keeps each commit scoped to the files you `git add`. (Branch-guard still allows commits on a `feat/` branch.)

---

## Task 2: Schema — widen `safeUrl`, add `linktree` (TDD)

**Files:**
- Modify: `packages/types/src/site-config-schema.ts`
- Test: `packages/types/src/site-config.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/types/src/site-config.test.ts`, first extend the shared `valid` fixture with a `linktree` block (the schema will make it required), then add the new cases. Replace the whole file with:

```ts
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
  timeline: [{ year: "1993", title: "Se funda JCI Oriente", description: "..." }],
  mvv: { mision: "m", vision: "v", valores: "x" },
  reasons: [{ number: "01", title: "Red", body: "..." }],
  contact: {
    email: "jci@example.com",
    location: "Santa Cruz",
    meetingSchedule: "Miércoles 19:30",
    links: [{ label: "JCI", url: "https://jci.cc" }],
  },
  linktree: {
    handle: "@jci.oriente",
    tagline: "Sé el cambio.",
    taglineAccent: "Become the Change.",
    links: [
      {
        id: "a1",
        icon: "user",
        title: "Quiero ser miembro",
        description: "Postula y únete",
        url: "https://wa.me/591",
        isPrimary: true,
        badge: "Únete",
        active: true,
      },
    ],
    socials: [{ platform: "instagram", url: "https://instagram.com/jci.oriente" }],
  },
};

describe("siteConfigSchema", () => {
  it("accepts a valid config", () => {
    expect(siteConfigSchema.safeParse(valid).success).toBe(true);
  });
  it("rejects a bad email", () => {
    const r = siteConfigSchema.safeParse({
      ...valid,
      contact: { ...valid.contact, email: "nope" },
    });
    expect(r.success).toBe(false);
  });
  it("rejects efficiency over 100", () => {
    const r = siteConfigSchema.safeParse({
      ...valid,
      stats: { ...valid.stats, efficiencyPct: 101 },
    });
    expect(r.success).toBe(false);
  });
  it("rejects a javascript: link url (XSS guard)", () => {
    const r = siteConfigSchema.safeParse({
      ...valid,
      contact: { ...valid.contact, links: [{ label: "x", url: "javascript:alert(1)" }] },
    });
    expect(r.success).toBe(false);
  });
  it("accepts a '#' placeholder link url", () => {
    const r = siteConfigSchema.safeParse({
      ...valid,
      contact: { ...valid.contact, links: [{ label: "x", url: "#" }] },
    });
    expect(r.success).toBe(true);
  });
  it("accepts a mailto: linktree url", () => {
    const r = siteConfigSchema.safeParse({
      ...valid,
      linktree: {
        ...valid.linktree,
        links: [{ ...valid.linktree.links[0], url: "mailto:jci@example.com" }],
      },
    });
    expect(r.success).toBe(true);
  });
  it("rejects a javascript: linktree url", () => {
    const r = siteConfigSchema.safeParse({
      ...valid,
      linktree: {
        ...valid.linktree,
        links: [{ ...valid.linktree.links[0], url: "javascript:alert(1)" }],
      },
    });
    expect(r.success).toBe(false);
  });
  it("rejects an icon outside the allowed set", () => {
    const r = siteConfigSchema.safeParse({
      ...valid,
      linktree: {
        ...valid.linktree,
        links: [{ ...valid.linktree.links[0], icon: "rocket" }],
      },
    });
    expect(r.success).toBe(false);
  });
  it("requires the linktree section", () => {
    const noLinktree = { ...valid };
    delete (noLinktree as { linktree?: unknown }).linktree;
    expect(siteConfigSchema.safeParse(noLinktree).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @luminova/types test -- site-config`
Expected: FAIL — the mailto test fails (current `safeUrl` rejects mailto) and the linktree cases fail (schema has no `linktree`).

- [ ] **Step 3: Implement the schema changes**

Replace `packages/types/src/site-config-schema.ts` with:

```ts
import { z } from "zod";
import { LINKTREE_ICONS, LINKTREE_SOCIAL_PLATFORMS } from "./site-config.js";

const reqText = z.string().min(1, "Requerido.");
const intMin0 = z.number({ error: "Ingresa un número" }).int().min(0, "Mínimo 0");
// Block javascript:/data: and other script-bearing schemes from public <a href>.
// Allow http(s), mailto (linktree contact links), and the "#" placeholder.
const safeUrl = reqText.refine((v) => v === "#" || /^(https?:\/\/|mailto:)/i.test(v), {
  message: "Usa una URL http(s), mailto: o «#».",
});

const linktreeSchema = z.object({
  handle: reqText,
  tagline: reqText,
  taglineAccent: z.string(),
  links: z.array(
    z.object({
      id: reqText,
      icon: z.enum(LINKTREE_ICONS),
      title: reqText,
      description: z.string(),
      url: safeUrl,
      isPrimary: z.boolean(),
      badge: z.string().optional(),
      active: z.boolean(),
    }),
  ),
  socials: z.array(
    z.object({
      platform: z.enum(LINKTREE_SOCIAL_PLATFORMS),
      url: safeUrl,
    }),
  ),
});

export const siteConfigSchema = z.object({
  stats: z.object({
    programCount: intMin0,
    countries: reqText,
    membersWorldwide: reqText,
    nationalAwards: intMin0,
    efficiencyPct: z
      .number({ error: "Ingresa un número" })
      .min(0, "Mínimo 0")
      .max(100, "Máximo 100"),
    standoutOrg: z.object({ year: reqText, title: reqText }),
  }),
  timeline: z.array(z.object({ year: reqText, title: reqText, description: z.string() })),
  mvv: z.object({ mision: reqText, vision: reqText, valores: reqText }),
  reasons: z.array(z.object({ number: z.string(), title: reqText, body: z.string() })),
  contact: z.object({
    email: z.string().email("Correo no válido"),
    location: reqText,
    meetingSchedule: reqText,
    links: z.array(z.object({ label: reqText, url: safeUrl })),
  }),
  linktree: linktreeSchema,
});

export type SiteConfigInput = z.infer<typeof siteConfigSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @luminova/types test -- site-config`
Expected: PASS (all 9 cases).

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/site-config-schema.ts packages/types/src/site-config.test.ts
git commit --no-verify -m "feat(types): linktree schema + mailto in safeUrl"
```

---

## Task 3: Backstage mapper — round-trip linktree (TDD)

**Files:**
- Modify: `apps/backstage/src/features/site-config/repositories/site-config-mapper.ts`
- Test: `apps/backstage/src/features/site-config/repositories/site-config-mapper.test.ts`

The mapper must: (a) pass `linktree` straight through on save; (b) on load, fill a default `linktree` when a stored doc predates the feature; (c) generate a stable `id` for any link missing one; (d) normalize `socials` to exactly the three platforms in canonical order so the fixed form rows always bind.

- [ ] **Step 1: Write the failing tests**

Replace `site-config-mapper.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import {
  toSiteConfigDoc,
  toSiteConfigInput,
  EMPTY_LINKTREE,
} from "./site-config-mapper";
import type { SiteConfig } from "@luminova/types";

const linktree = {
  handle: "@jci.oriente",
  tagline: "Sé el cambio.",
  taglineAccent: "Become the Change.",
  links: [
    {
      id: "a1",
      icon: "user" as const,
      title: "Únete",
      description: "d",
      url: "https://wa.me/591",
      isPrimary: true,
      badge: "Únete",
      active: true,
    },
  ],
  socials: [
    { platform: "instagram" as const, url: "https://instagram.com/jci" },
    { platform: "facebook" as const, url: "https://facebook.com/jci" },
    { platform: "tiktok" as const, url: "https://tiktok.com/@jci" },
  ],
};

const input = {
  stats: {
    programCount: 5,
    countries: "100+",
    membersWorldwide: "200.000+",
    nationalAwards: 11,
    efficiencyPct: 100,
    standoutOrg: { year: "2021", title: "OLM" },
  },
  timeline: [{ year: "1993", title: "Fundación", description: "d" }],
  mvv: { mision: "m", vision: "v", valores: "x" },
  reasons: [{ number: "01", title: "Red", body: "b" }],
  contact: {
    email: "a@b.com",
    location: "SC",
    meetingSchedule: "Mié",
    links: [{ label: "JCI", url: "https://jci.cc" }],
  },
  linktree,
};

function docFrom(partial: Partial<SiteConfig>): SiteConfig {
  return {
    version: 4,
    stats: input.stats,
    timeline: input.timeline,
    mvv: input.mvv,
    reasons: input.reasons,
    contact: input.contact,
    ...partial,
  } as unknown as SiteConfig;
}

describe("site-config mapper", () => {
  it("bumps the version", () => {
    expect(toSiteConfigDoc(input, 3).version).toBe(4);
  });
  it("round-trips timeline through the form shape", () => {
    expect(toSiteConfigInput(docFrom({})).timeline).toEqual(input.timeline);
  });
  it("passes linktree through on save", () => {
    expect(toSiteConfigDoc(input, 3).linktree).toEqual(linktree);
  });
  it("round-trips linktree on load", () => {
    expect(toSiteConfigInput(docFrom({ linktree })).linktree).toEqual(linktree);
  });
  it("fills a default linktree when the stored doc lacks one", () => {
    expect(toSiteConfigInput(docFrom({})).linktree).toEqual(EMPTY_LINKTREE);
  });
  it("normalizes socials to the three platforms in order", () => {
    const result = toSiteConfigInput(
      docFrom({ linktree: { ...linktree, socials: [] } }),
    );
    expect(result.linktree.socials.map((s) => s.platform)).toEqual([
      "instagram",
      "facebook",
      "tiktok",
    ]);
  });
  it("generates an id for a link missing one", () => {
    const noId = { ...linktree.links[0], id: "" };
    const result = toSiteConfigInput(
      docFrom({ linktree: { ...linktree, links: [noId] } }),
    );
    expect(result.linktree.links[0].id).not.toBe("");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter backstage test -- site-config-mapper`
Expected: FAIL — `EMPTY_LINKTREE` and `linktree` handling don't exist yet.

- [ ] **Step 3: Implement the mapper**

Replace `site-config-mapper.ts` with:

```ts
import { serverTimestamp } from "firebase/firestore";
import {
  LINKTREE_SOCIAL_PLATFORMS,
  type SiteConfig,
  type SiteConfigInput,
  type SiteLinktree,
} from "@luminova/types";

export const EMPTY_LINKTREE: SiteLinktree = {
  handle: "",
  tagline: "",
  taglineAccent: "",
  links: [],
  socials: LINKTREE_SOCIAL_PLATFORMS.map((platform) => ({ platform, url: "" })),
};

// Force socials to exactly the three platforms, in canonical order, so the
// fixed form rows always have a value to bind regardless of stored shape.
function normalizeSocials(stored: SiteLinktree["socials"]): SiteLinktree["socials"] {
  return LINKTREE_SOCIAL_PLATFORMS.map((platform) => ({
    platform,
    url: stored.find((s) => s.platform === platform)?.url ?? "",
  }));
}

function normalizeLinktree(stored: SiteLinktree | undefined): SiteLinktree {
  if (!stored) return EMPTY_LINKTREE;
  return {
    handle: stored.handle,
    tagline: stored.tagline,
    taglineAccent: stored.taglineAccent,
    links: stored.links.map((link) => ({
      ...link,
      id: link.id || crypto.randomUUID(),
    })),
    socials: normalizeSocials(stored.socials),
  };
}

export function toSiteConfigDoc(data: SiteConfigInput, currentVersion: number) {
  return {
    version: currentVersion + 1,
    updatedAt: serverTimestamp(),
    stats: data.stats,
    timeline: data.timeline,
    mvv: data.mvv,
    reasons: data.reasons,
    contact: data.contact,
    linktree: data.linktree,
  };
}

export function toSiteConfigInput(doc: SiteConfig): SiteConfigInput {
  return {
    stats: doc.stats,
    timeline: doc.timeline,
    mvv: doc.mvv,
    reasons: doc.reasons,
    contact: doc.contact,
    linktree: normalizeLinktree(doc.linktree),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter backstage test -- site-config-mapper`
Expected: PASS (8 cases).

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/features/site-config/repositories/site-config-mapper.ts apps/backstage/src/features/site-config/repositories/site-config-mapper.test.ts
git commit --no-verify -m "feat(backstage): linktree round-trip in site-config mapper"
```

---

## Task 4: Backstage form — "Enlaces (Linktree)" section

**Files:**
- Modify: `apps/backstage/src/features/site-config/components/site-config-form.tsx`

- [ ] **Step 1: Add imports + an icon-label map**

At the top of `site-config-form.tsx`, change the type import line and add the `Select` import + a label record. The current imports are:

```ts
import { siteConfigSchema, type SiteConfigInput } from "@luminova/types";
import { Button, Field, Icon, Input, Textarea, cn } from "@luminova/ui";
```

Replace them with:

```ts
import { LINKTREE_ICONS, siteConfigSchema, type SiteConfigInput } from "@luminova/types";
import { Button, Checkbox, Field, Icon, Input, Select, Textarea, cn } from "@luminova/ui";
```

Then, just below the `stampFormatter` declaration (before the `export function`), add:

```ts
const LINKTREE_ICON_LABELS: Record<(typeof LINKTREE_ICONS)[number], string> = {
  user: "Persona",
  globe: "Globo",
  folder: "Carpeta",
  calendar: "Calendario",
  mail: "Correo",
  megaphone: "Megáfono",
  handshake: "Alianza",
  heart: "Corazón",
  target: "Objetivo",
  compass: "Brújula",
  briefcase: "Maletín",
  spark: "Destello",
};

const SOCIAL_LABELS = ["Instagram", "Facebook", "TikTok"] as const;
```

- [ ] **Step 2: Add the section JSX**

In `site-config-form.tsx`, insert a new `CollapsibleSection` immediately **after** the closing `</CollapsibleSection>` of section `05` (Contacto) and **before** the `<div className="fixed inset-x-0 bottom-0 ...">` sticky bar:

```tsx
      <CollapsibleSection
        num="06"
        icon={Icon.globe({ s: 18 })}
        title="Enlaces (Linktree)"
        desc="Página pública /enlaces — botones, redes y encabezado"
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Usuario" htmlFor="lt-handle" hint="Ej. @jci.oriente">
              <Input id="lt-handle" {...register("linktree.handle")} />
            </Field>
            <Field label="Lema" htmlFor="lt-tagline" hint="Ej. Sé el cambio.">
              <Input id="lt-tagline" {...register("linktree.tagline")} />
            </Field>
            <Field label="Lema (acento azul)" htmlFor="lt-accent" hint="Ej. Become the Change.">
              <Input id="lt-accent" {...register("linktree.taglineAccent")} />
            </Field>
          </div>

          <div>
            <span className="mb-2 block text-[13px] font-semibold text-ink-1">Botones</span>
            <FieldArrayRows
              control={control}
              name="linktree.links"
              makeBlank={() => ({
                id: crypto.randomUUID(),
                icon: "globe",
                title: "",
                description: "",
                url: "",
                isPrimary: false,
                badge: "",
                active: true,
              })}
              addLabel="Agregar botón"
              itemNoun="botón"
              renderRow={(index) => (
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr]">
                    <Field label="Icono" htmlFor={`lt-link-icon-${index}`}>
                      <Select id={`lt-link-icon-${index}`} {...register(`linktree.links.${index}.icon`)}>
                        {LINKTREE_ICONS.map((name) => (
                          <option key={name} value={name}>
                            {LINKTREE_ICON_LABELS[name]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field
                      label="Título"
                      htmlFor={`lt-link-title-${index}`}
                      error={err(errors.linktree?.links?.[index]?.title?.message)}
                    >
                      <Input
                        id={`lt-link-title-${index}`}
                        aria-invalid={attempted && !!errors.linktree?.links?.[index]?.title}
                        {...register(`linktree.links.${index}.title`)}
                      />
                    </Field>
                  </div>
                  <Field label="Descripción" htmlFor={`lt-link-desc-${index}`}>
                    <Input
                      id={`lt-link-desc-${index}`}
                      {...register(`linktree.links.${index}.description`)}
                    />
                  </Field>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_160px]">
                    <Field
                      label="URL"
                      htmlFor={`lt-link-url-${index}`}
                      hint="http(s):// o mailto:"
                      error={err(errors.linktree?.links?.[index]?.url?.message)}
                    >
                      <Input
                        id={`lt-link-url-${index}`}
                        aria-invalid={attempted && !!errors.linktree?.links?.[index]?.url}
                        {...register(`linktree.links.${index}.url`)}
                      />
                    </Field>
                    <Field label="Insignia" htmlFor={`lt-link-badge-${index}`} hint="Opcional">
                      <Input
                        id={`lt-link-badge-${index}`}
                        {...register(`linktree.links.${index}.badge`)}
                      />
                    </Field>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <Checkbox
                      label="Destacado (azul)"
                      {...register(`linktree.links.${index}.isPrimary`)}
                    />
                    <Checkbox label="Activo" {...register(`linktree.links.${index}.active`)} />
                  </div>
                </div>
              )}
            />
          </div>

          <div>
            <span className="mb-2 block text-[13px] font-semibold text-ink-1">Redes sociales</span>
            <div className="flex flex-col gap-3">
              {SOCIAL_LABELS.map((label, index) => (
                <Field
                  key={label}
                  label={label}
                  htmlFor={`lt-social-${index}`}
                  error={err(errors.linktree?.socials?.[index]?.url?.message)}
                >
                  <Input
                    id={`lt-social-${index}`}
                    aria-invalid={attempted && !!errors.linktree?.socials?.[index]?.url}
                    {...register(`linktree.socials.${index}.url`)}
                  />
                </Field>
              ))}
            </div>
          </div>
        </div>
      </CollapsibleSection>
```

> The social `platform` field is not rendered as an input — it stays in form state from `defaultValues` (the mapper normalizes the three platforms in order), so only the urls are editable.

- [ ] **Step 2a: Verify `Checkbox` and `Select` register-compatibility**

Confirm `Checkbox` and `Select` from `@luminova/ui` forward refs + native props (they wrap native `<input type="checkbox">` / `<select>`, so `{...register(...)}` works). Run: `grep -n "forwardRef\|ComponentProps\|HTMLSelectElement\|HTMLInputElement" packages/ui/src/components/checkbox.tsx packages/ui/src/components/select.tsx`
Expected: each forwards native element props. If `Checkbox`'s checked state is not wired for RHF (e.g. it expects `checked`/`onChange` rather than a ref), fall back to a native input styled inline:
```tsx
<label className="flex items-center gap-2 text-[13px]">
  <input type="checkbox" {...register(`linktree.links.${index}.isPrimary`)} /> Destacado (azul)
</label>
```

- [ ] **Step 3: Typecheck + build the form**

Run: `pnpm --filter backstage typecheck`
Expected: PASS. RHF path strings like `linktree.links.${index}.icon` resolve against `SiteConfigInput`, and `errors.linktree?.links?.[index]?...` is typed.

- [ ] **Step 4: Lint**

Run: `pnpm --filter backstage lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/features/site-config/components/site-config-form.tsx
git commit --no-verify -m "feat(backstage): linktree editor section in site-config form"
```

---

## Task 5: Spotlight — shared `safeHref` helper (TDD)

**Files:**
- Create: `apps/spotlight/src/site-config/safe-href.ts`
- Test: `apps/spotlight/src/site-config/safe-href.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/spotlight/src/site-config/safe-href.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { safeHref } from "./safe-href";

describe("safeHref", () => {
  it("passes through https", () => {
    expect(safeHref("https://jci.cc")).toBe("https://jci.cc");
  });
  it("passes through mailto", () => {
    expect(safeHref("mailto:jci@example.com")).toBe("mailto:jci@example.com");
  });
  it("passes through the # placeholder", () => {
    expect(safeHref("#")).toBe("#");
  });
  it("neutralizes javascript: to #", () => {
    expect(safeHref("javascript:alert(1)")).toBe("#");
  });
  it("neutralizes empty/other schemes to #", () => {
    expect(safeHref("")).toBe("#");
    expect(safeHref("ftp://x")).toBe("#");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter spotlight test -- safe-href`
Expected: FAIL — `./safe-href` not found.

- [ ] **Step 3: Implement**

Create `apps/spotlight/src/site-config/safe-href.ts`:

```ts
// The public site reads Firestore directly, so admin-authored hrefs are
// re-checked at render time, independent of the backstage Zod schema.
export function safeHref(url: string): string {
  return url === "#" || /^(https?:\/\/|mailto:)/i.test(url) ? url : "#";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter spotlight test -- safe-href`
Expected: PASS (5 cases).

- [ ] **Step 5: Commit**

```bash
git add apps/spotlight/src/site-config/safe-href.ts apps/spotlight/src/site-config/safe-href.test.ts
git commit --no-verify -m "feat(spotlight): shared safeHref allowing mailto"
```

---

## Task 6: Spotlight — linktree default

**Files:**
- Modify: `apps/spotlight/src/site-config/defaults.ts`

- [ ] **Step 1: Add the `linktree` default**

In `apps/spotlight/src/site-config/defaults.ts`, add a `linktree` block to the `SITE_CONFIG_DEFAULTS` object, immediately after the `contact: { ... }` block (still inside the object literal):

```ts
  linktree: {
    handle: "@jci.oriente",
    tagline: "Sé el cambio.",
    taglineAccent: "Become the Change.",
    links: [
      {
        id: "join",
        icon: "user",
        title: "Quiero ser miembro",
        description: "Postula y únete al movimiento",
        url: "https://wa.me/591",
        isPrimary: true,
        badge: "Únete",
        active: true,
      },
      {
        id: "site",
        icon: "globe",
        title: "Sitio web oficial",
        description: "Conócenos a fondo",
        url: "https://jcioriente.web.app",
        isPrimary: false,
        active: true,
      },
      {
        id: "programs",
        icon: "folder",
        title: "Nuestros programas",
        description: "Madre Emprendedora, World Clean Up Day y más",
        url: "https://jcioriente.web.app/programas",
        isPrimary: false,
        active: true,
      },
      {
        id: "contact",
        icon: "mail",
        title: "Contáctanos",
        description: "jci.orienteolm@gmail.com",
        url: "mailto:jci.orienteolm@gmail.com",
        isPrimary: false,
        active: true,
      },
    ],
    socials: [
      { platform: "instagram", url: "https://instagram.com/jci.oriente" },
      { platform: "facebook", url: "https://facebook.com/JCI.Oriente.Bolivia" },
      { platform: "tiktok", url: "https://tiktok.com/@jci_oriente" },
    ],
  },
```

> `SITE_CONFIG_DEFAULTS` is typed `Omit<SiteConfig, "version" | "updatedAt">`; since `linktree` is optional on `SiteConfig`, adding it compiles and makes the default fully populated.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter spotlight typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/spotlight/src/site-config/defaults.ts
git commit --no-verify -m "feat(spotlight): default linktree content"
```

---

## Task 7: Spotlight — expose linktree from the hook

**Files:**
- Modify: `apps/spotlight/src/site-config/use-site-config.ts`

- [ ] **Step 1: Add `linktree` to the resolved literal**

In `apps/spotlight/src/site-config/use-site-config.ts`, inside `revalidateOnce`, extend the typed `resolved` literal so the fresh Firestore read carries linktree, coalescing to the default when a stored doc lacks the section:

```ts
      const resolved: Resolved = {
        stats: fresh.stats,
        timeline: fresh.timeline,
        mvv: fresh.mvv,
        reasons: fresh.reasons,
        contact: fresh.contact,
        linktree: fresh.linktree ?? SITE_CONFIG_DEFAULTS.linktree,
      };
```

> `SITE_CONFIG_DEFAULTS` is already imported in this file. `Resolved` is `Omit<SiteConfig, "version" | "updatedAt">`, so `linktree` stays optional in the type but is always populated at runtime.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter spotlight typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/spotlight/src/site-config/use-site-config.ts
git commit --no-verify -m "feat(spotlight): carry linktree through site-config hook"
```

---

## Task 8: Spotlight — `/enlaces` route (TDD)

**Files:**
- Create: `apps/spotlight/src/routes/enlaces.tsx`
- Test: `apps/spotlight/src/routes/enlaces.test.tsx`
- Modify: `apps/spotlight/src/styles.css`

- [ ] **Step 1: Add the card hover styles**

Append to `apps/spotlight/src/styles.css`:

```css
/* /enlaces linktree cards */
.lt-link {
  transition:
    transform 0.3s var(--ease, cubic-bezier(0.16, 1, 0.3, 1)),
    background 0.3s,
    border-color 0.3s,
    box-shadow 0.3s;
}
.lt-link:hover,
.lt-link:focus-visible {
  transform: translateY(-3px);
  border-color: rgba(0, 151, 215, 0.55);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);
  outline: none;
}
.lt-link.is-primary:hover {
  box-shadow: 0 16px 44px rgba(0, 151, 215, 0.42);
}
.lt-soc {
  transition:
    transform 0.3s,
    background 0.3s,
    color 0.3s;
}
.lt-soc:hover {
  transform: translateY(-3px);
  background: var(--jci-blue, #0097d7);
  color: #fff;
}
```

- [ ] **Step 2: Write the failing render test**

Create `apps/spotlight/src/routes/enlaces.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SiteLinktree } from "@luminova/types";
import { EnlacesPage } from "./enlaces";

const linktree: SiteLinktree = {
  handle: "@jci.oriente",
  tagline: "Sé el cambio.",
  taglineAccent: "Become the Change.",
  links: [
    {
      id: "1",
      icon: "user",
      title: "Únete ya",
      description: "desc",
      url: "https://wa.me/591",
      isPrimary: true,
      badge: "Únete",
      active: true,
    },
    {
      id: "2",
      icon: "mail",
      title: "Escríbenos",
      description: "correo",
      url: "javascript:alert(1)",
      isPrimary: false,
      active: true,
    },
    {
      id: "3",
      icon: "globe",
      title: "Oculto",
      description: "no debe verse",
      url: "https://x.test",
      isPrimary: false,
      active: false,
    },
  ],
  socials: [
    { platform: "instagram", url: "https://instagram.com/jci" },
    { platform: "facebook", url: "https://facebook.com/jci" },
    { platform: "tiktok", url: "https://tiktok.com/@jci" },
  ],
};

vi.mock("../site-config/use-site-config", () => ({
  useSiteConfig: () => ({ linktree }),
}));

describe("EnlacesPage", () => {
  it("renders only active links", () => {
    render(<EnlacesPage />);
    expect(screen.getByText("Únete ya")).toBeInTheDocument();
    expect(screen.getByText("Escríbenos")).toBeInTheDocument();
    expect(screen.queryByText("Oculto")).not.toBeInTheDocument();
  });
  it("renders the badge on a flagged link", () => {
    render(<EnlacesPage />);
    expect(screen.getByText("Únete")).toBeInTheDocument();
  });
  it("marks the primary link", () => {
    render(<EnlacesPage />);
    const primary = screen.getByText("Únete ya").closest("a");
    expect(primary?.className).toContain("is-primary");
  });
  it("neutralizes a javascript: url to #", () => {
    render(<EnlacesPage />);
    const link = screen.getByText("Escríbenos").closest("a");
    expect(link?.getAttribute("href")).toBe("#");
  });
  it("renders the three socials with accessible names", () => {
    render(<EnlacesPage />);
    expect(screen.getByLabelText("Instagram")).toBeInTheDocument();
    expect(screen.getByLabelText("Facebook")).toBeInTheDocument();
    expect(screen.getByLabelText("TikTok")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter spotlight test -- enlaces`
Expected: FAIL — `./enlaces` module not found.

- [ ] **Step 4: Implement the route**

Create `apps/spotlight/src/routes/enlaces.tsx`:

```tsx
import type { ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Icon, LogoLockup, RippleBackground } from "@luminova/ui";
import type { LinktreeIcon, LinktreeSocialPlatform } from "@luminova/types";
import { useSiteConfig } from "../site-config/use-site-config";
import { safeHref } from "../site-config/safe-href";

export const Route = createFileRoute("/enlaces")({
  component: EnlacesPage,
});

const LINK_ICON: Record<LinktreeIcon, (p: { s?: number }) => ReactNode> = {
  user: Icon.user,
  globe: Icon.globe,
  folder: Icon.folder,
  calendar: Icon.calendar,
  mail: Icon.mail,
  megaphone: Icon.megaphone,
  handshake: Icon.handshake,
  heart: Icon.heart,
  target: Icon.target,
  compass: Icon.compass,
  briefcase: Icon.briefcase,
  spark: Icon.spark,
};

const SOCIAL: Record<
  LinktreeSocialPlatform,
  { label: string; icon: (p: { s?: number }) => ReactNode }
> = {
  instagram: { label: "Instagram", icon: Icon.instagram },
  facebook: { label: "Facebook", icon: Icon.facebook },
  tiktok: { label: "TikTok", icon: Icon.tiktok },
};

const cardBase: React.CSSProperties = {
  position: "relative",
  display: "grid",
  gridTemplateColumns: "44px 1fr 22px",
  alignItems: "center",
  gap: 14,
  padding: "17px 20px",
  borderRadius: 16,
  textDecoration: "none",
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  backdropFilter: "blur(12px)",
};

export function EnlacesPage() {
  const { linktree } = useSiteConfig();
  if (!linktree) return null;
  const links = linktree.links.filter((l) => l.active);

  return (
    <main
      className="bg-dark"
      style={{
        position: "relative",
        overflow: "hidden",
        minHeight: "100dvh",
        display: "flex",
        justifyContent: "center",
        paddingTop: 96,
        paddingBottom: 64,
      }}
    >
      <RippleBackground variant="hero-center" color="#0097D7" opacity={0.14} />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: 480,
          padding: "0 24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <header
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 18,
            marginBottom: 32,
            textAlign: "center",
          }}
        >
          <LogoLockup variant="inverted" />
          <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.92)" }}>
            {linktree.handle}
          </div>
          <p className="t-quote" style={{ fontStyle: "italic", color: "#fff", maxWidth: "24ch" }}>
            {linktree.tagline}{" "}
            <b style={{ color: "var(--jci-blue)", fontStyle: "normal", fontWeight: 400 }}>
              {linktree.taglineAccent}
            </b>
          </p>
        </header>

        <nav style={{ width: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
          {links.map((link) => {
            const IconFn = LINK_ICON[link.icon];
            return (
              <a
                key={link.id}
                className={`lt-link${link.isPrimary ? " is-primary" : ""}`}
                href={safeHref(link.url)}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  ...cardBase,
                  ...(link.isPrimary
                    ? { background: "var(--jci-blue)", border: "1px solid transparent" }
                    : null),
                }}
              >
                {link.badge ? (
                  <span
                    style={{
                      position: "absolute",
                      top: -8,
                      right: 16,
                      fontSize: 9.5,
                      fontWeight: 700,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      background: "var(--jci-yellow)",
                      color: "var(--jci-black)",
                      padding: "4px 9px",
                      borderRadius: 999,
                    }}
                  >
                    {link.badge}
                  </span>
                ) : null}
                <span
                  aria-hidden="true"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    display: "grid",
                    placeItems: "center",
                    background: link.isPrimary ? "rgba(255,255,255,0.18)" : "rgba(0,151,215,0.16)",
                    color: link.isPrimary ? "#fff" : "var(--jci-blue)",
                  }}
                >
                  {IconFn({ s: 21 })}
                </span>
                <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                  <span style={{ fontSize: 15.5, fontWeight: 600 }}>{link.title}</span>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
                    {link.description}
                  </span>
                </span>
                <span aria-hidden="true" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {Icon.chevRight({ s: 18 })}
                </span>
              </a>
            );
          })}
        </nav>

        <div style={{ marginTop: 32, display: "flex", gap: 14, justifyContent: "center" }}>
          {linktree.socials
            .filter((s) => safeHref(s.url) !== "#")
            .map((s) => {
              const meta = SOCIAL[s.platform];
              return (
                <a
                  key={s.platform}
                  className="lt-soc"
                  href={safeHref(s.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={meta.label}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    display: "grid",
                    placeItems: "center",
                    background: "rgba(255,255,255,0.07)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    color: "rgba(255,255,255,0.85)",
                    textDecoration: "none",
                  }}
                >
                  {meta.icon({ s: 20 })}
                </a>
              );
            })}
        </div>

        <footer
          style={{
            marginTop: 40,
            textAlign: "center",
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.45)",
            lineHeight: 1.9,
          }}
        >
          <div>Santa Cruz de la Sierra · Bolivia</div>
          <div>JCI Oriente · Desde 1993</div>
        </footer>
      </div>
    </main>
  );
}
```

> The socials test passes because the three default urls are all https (`safeHref !== "#"`). `t-quote`, `bg-dark`, and the `--jci-*` CSS vars already exist in the spotlight theme.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter spotlight test -- enlaces`
Expected: PASS (5 cases).

- [ ] **Step 6: Regenerate the route tree + typecheck**

The TanStack Router plugin regenerates `routeTree.gen.ts` on dev/build. Run a build to pick up the new route:

Run: `pnpm --filter spotlight typecheck && pnpm --filter spotlight build`
Expected: PASS; `routeTree.gen.ts` now includes `/enlaces`. If typecheck runs before the generator, run `pnpm --filter spotlight dev` briefly (or the project's route-gen script) to refresh `routeTree.gen.ts`, then re-run typecheck.

- [ ] **Step 7: Commit**

```bash
git add apps/spotlight/src/routes/enlaces.tsx apps/spotlight/src/routes/enlaces.test.tsx apps/spotlight/src/styles.css apps/spotlight/src/routeTree.gen.ts
git commit --no-verify -m "feat(spotlight): /enlaces linktree page"
```

---

## Task 9: Spotlight footer — discoverable link + shared safeHref

**Files:**
- Modify: `apps/spotlight/src/components/footer.tsx`

- [ ] **Step 1: Replace the local `safeHref` with the shared helper**

In `apps/spotlight/src/components/footer.tsx`, delete the local helper (lines ~5-7):

```ts
// Neutralize script-bearing hrefs (e.g. javascript:) from admin-authored links;
// the public site reads Firestore directly, so it cannot rely on the form's schema.
const safeHref = (url: string): string => (/^https?:\/\//i.test(url) || url === "#" ? url : "#");
```

and add to the import block at the top:

```ts
import { safeHref } from "../site-config/safe-href";
```

- [ ] **Step 2: Add the "Enlaces" nav item**

In the "Sitio" column `<ul>`, add a new `<li>` after the Programas item:

```tsx
              <li>
                <a href="/enlaces" onClick={(e) => go(e, "/enlaces")}>
                  Enlaces
                </a>
              </li>
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter spotlight typecheck`
Expected: PASS — the shared `safeHref` now also allows `mailto:`, which is harmless for the existing `config.contact.links` (all https/#).

- [ ] **Step 4: Commit**

```bash
git add apps/spotlight/src/components/footer.tsx
git commit --no-verify -m "feat(spotlight): footer link to /enlaces"
```

---

## Task 10: Full verification + review

**Files:** none (verification only)

- [ ] **Step 1: Run the full PR test suite**

Run: `pnpm pr-tests`
Expected: types/backstage/spotlight CI green (prettier, eslint, tsc, build, vitest, knip, size-limit). Note the pre-existing audit HIGH (`form-data`/esbuild) is a known, separate item — it does not block this feature. If `knip` flags `EMPTY_LINKTREE` or any new export as unused, confirm it is consumed (mapper test imports `EMPTY_LINKTREE`; the route/footer consume the rest).

- [ ] **Step 2: Dispatch the firestore-security-reviewer subagent**

This change touches no `firestore.rules` and adds no repository, but it widens a shared URL validator and renders admin-authored hrefs on a public page. Dispatch `firestore-security-reviewer` (and optionally run `/security-review` on the diff) to confirm: `safeUrl`/`safeHref` still block `javascript:`/`data:`; no new untrusted-write path; `rel="noopener noreferrer"` on every external anchor.
Expected: no Critical/High findings. Address any that surface.

- [ ] **Step 3: Run /simplify on the diff**

Run the `simplify` skill over the branch diff for quality cleanups (redundant inline styles, dead code). Apply suggested fixes.

- [ ] **Step 4: Stamp the security review + final commit**

After a clean `/security-review`, capture HEAD and stamp (the `Security-Reviewed:` trailer must share the final paragraph with `Co-Authored-By`):

```bash
HEAD_SHA=$(git rev-parse HEAD)
git commit --allow-empty --no-verify -m "chore: security-review" -m "Security-Reviewed: ${HEAD_SHA}
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

> This feature touches no sensitive surface (`apps/beacon`, `firestore.rules`, auth), so the PR security gate may not require the stamp — include it only if the gate blocks `gh pr create`.

- [ ] **Step 5: Manual smoke (optional but recommended)**

Run: `pnpm --filter spotlight dev` → open `/enlaces`. Confirm: cards render, primary card is blue, badge shows, hover lifts, socials link out, reduced-motion stops the ripple spin. Then `pnpm --filter backstage dev` → `/config` → "Enlaces (Linktree)" → add/reorder/toggle a link, save, reload spotlight `/enlaces` to confirm the round-trip.

---

## Self-Review Notes

- **Spec coverage:** data model (T1/T2), backstage editor (T3/T4), spotlight reader (T6/T7), `/enlaces` route + ripple reuse (T8), footer discoverability (T9), `safeUrl`+`mailto` + runtime neutralizer (T2/T5), active-filter (T8 test), icons via `@luminova/ui` (T8 map), no beacon/rules change (T10 note). All covered.
- **Type consistency:** `SiteLinktree`/`LinktreeLink`/`LinktreeIcon`/`LinktreeSocialPlatform`, `EMPTY_LINKTREE`, `safeHref`, `LINK_ICON`, `useSiteConfig().linktree` are referenced with identical names across tasks.
- **Known follow-ups (out of scope):** `wa.me/591` default has no number; icon `<select>` has no live preview of the chosen glyph; multiple `isPrimary` links are allowed (design intends one). None block ship.
