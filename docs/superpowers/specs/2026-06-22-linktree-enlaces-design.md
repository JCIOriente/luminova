# Linktree — president-editable `/enlaces` page

**Date:** 2026-06-22
**Branch:** `feat/linktree-enlaces`
**Status:** Design — awaiting user review

## Goal

Ship a public link-aggregator page (linktr.ee-style) for JCI Oriente at
`apps/spotlight` route `/enlaces`, fully editable by the president from
`apps/backstage` `/config`. Ported from the Claude Design project
`JCI Oriente / Linktree.html` (dark theme, JCI brand colors, ripple motif,
glassmorphism link cards, socials, footer).

## Decisions (locked in brainstorming)

1. **Placement** — spotlight React route `/enlaces` (TSX + Tailwind v4 tokens),
   not standalone HTML, not a separate microsite.
2. **Editable from backstage** — president-managed, no deploy to change links.
3. **Data model** — fold into the existing `siteConfig/current` singleton as a
   new `linktree` section. No new collection.
4. **Icons** — curated picker over the existing bespoke `@luminova/ui` `Icon`
   set. No `lucide-react` dependency.
5. **Active flag** — each link has `active: boolean`; spotlight renders only
   `active === true`.
6. **Discoverable** — add an "Enlaces" entry to the spotlight footer "Sitio"
   nav so `/enlaces` is reachable from the main site, not orphaned.

## Architecture (additive — no beacon, no rules change)

```
backstage /config  ──writes──▶  siteConfig/current.linktree   (world-read, Admin-write)
                                          │  firestore-lite + localStorage SWR
spotlight /enlaces  ◀──reads───────────────┘   (TanStack Query banned in spotlight)
```

`siteConfig/current` is already world-read + Admin-write (`firestore.rules:401`,
`allow write: if hasAnyRole(['Admin'])`) and is read directly by spotlight via
`getFirestoreLite()` — **no Cloud Function projection and no rules edit are
required.** The linktree section rides the existing read/write path. (The newer
`perms`-claim model — `hasPerm`/`manage:*` — has landed in the rules but does
**not** gate `siteConfig`, which stays Admin-only; linktree inherits that. If a
later track migrates `siteConfig` to a perm gate, linktree rides along
unchanged since it is the same doc.)

## Data model — extend `SiteConfig`

`packages/types/src/site-config.ts` + `site-config-schema.ts`. The `linktree`
field is **optional** for back-compat with existing docs (spotlight falls back
to defaults when absent).

```ts
export const LINKTREE_ICONS = [
  "user", "globe", "folder", "calendar", "mail",
  "megaphone", "handshake", "heart", "target", "compass",
  "briefcase", "spark",
] as const;
export type LinktreeIcon = (typeof LINKTREE_ICONS)[number];

export interface LinktreeLink {
  id: string;            // stable key for reorder / React keys
  icon: LinktreeIcon;    // chosen from LINKTREE_ICONS
  title: string;         // "Quiero ser miembro"
  description: string;   // "Postula y únete al movimiento"
  url: string;           // safeUrl — http(s) + mailto, blocks javascript:
  isPrimary: boolean;    // blue highlighted CTA (design `.link.primary`)
  badge?: string;        // optional flag pill, e.g. "Únete"
  active: boolean;       // only true links render on /enlaces
}

export interface LinktreeSocial {
  platform: "instagram" | "facebook" | "tiktok";
  url: string;
}

export interface SiteLinktree {
  handle: string;        // "@jci.oriente"
  tagline: string;       // "Sé el cambio."
  taglineAccent: string; // "Become the Change." (blue accent span)
  links: LinktreeLink[];
  socials: LinktreeSocial[];
}

// SiteConfig gains:  linktree?: SiteLinktree;
```

`LINKTREE_ICONS` is the single source shared by the Zod enum, the backstage
icon `<select>`, and the spotlight render map (`icon name → <Icon.* />`).

### Zod schema

```ts
linktree: z.object({
  handle: reqText,
  tagline: reqText,
  taglineAccent: z.string(),
  links: z.array(z.object({
    id: reqText,
    icon: z.enum(LINKTREE_ICONS),
    title: reqText,
    description: z.string(),
    url: safeUrl,
    isPrimary: z.boolean(),
    badge: z.string().optional(),
    active: z.boolean(),
  })),
  socials: z.array(z.object({
    platform: z.enum(["instagram", "facebook", "tiktok"]),
    url: safeUrl,
  })),
}).optional(),
```

**Confirmed change — widen `safeUrl` for `mailto:`.** The current validator
(`site-config-schema.ts:6`) is
`reqText.refine((v) => v === "#" || /^https?:\/\//i.test(v))` — it rejects
`mailto:`, so the design's `mailto:jci.orienteolm@gmail.com` link would fail
validation. Widen the scheme test to `/^(https?:\/\/|mailto:)/i` (still blocks
`javascript:` and every other scheme). This is a shared validator, so it also
relaxes `contact.links` to permit mailto — acceptable (mailto is not an
injection vector). Mirror the same allowance in the spotlight runtime
neutralizer (see below).

**Spotlight runtime neutralizer.** Firestore is read directly on the public
site, so admin-authored hrefs are re-checked at render, independent of the Zod
schema. `footer.tsx:7` already has `safeHref` (`/^https?:\/\//i || "#"`). The
`/enlaces` route needs the same guard, widened to also allow `mailto:`. Extract
a shared `safeHref` helper (allows `http(s):` + `mailto:`, else `#`) and reuse
it in both `footer.tsx` and `enlaces.tsx` rather than duplicating.

## Backstage editor

- `apps/backstage/src/features/site-config/components/site-config-form.tsx` —
  new `CollapsibleSection` "Enlaces (Linktree)" after Contacto. Contains:
  - `handle`, `tagline`, `taglineAccent` text inputs.
  - `FieldArrayRows` for `links` (reuse the existing field-array pattern): per
    row → icon `<select>` (LINKTREE_ICONS), title, description, url, `isPrimary`
    checkbox, `badge` input, `active` checkbox. Add / remove / move supported by
    the existing component.
  - Three fixed social rows (instagram / facebook / tiktok) each with a url input.
- `apps/backstage/src/features/site-config/repositories/site-config-mapper.ts` —
  extend `toSiteConfigDoc()` and `toSiteConfigInput()` to round-trip `linktree`.
  Generate `id` for new links (e.g. crypto.randomUUID) when blank.
- No repository / rules / query-key changes — the existing `siteConfig/current`
  read+write covers the new field.

## Spotlight `/enlaces`

- `apps/spotlight/src/routes/enlaces.tsx` — new public route (no auth), ported
  from `Linktree.html`:
  - Ripple background — reuse the existing `RippleBackground` component from
    `@luminova/ui` (already used by the footer); no from-scratch SVG port.
  - Brand header — existing spotlight logo asset (reused, not re-uploaded),
    `handle`, `tagline` + `taglineAccent` (accent span in `--jci-blue`).
  - Links nav — `links.filter(l => l.active).map(...)` → glass cards; `.primary`
    styling for `isPrimary`; optional `badge` pill; `<Icon.{icon} />` from
    `@luminova/ui`; chevron; `target="_blank" rel="noopener"`.
  - Socials — `socials.map(...)` → circular icon buttons (`Icon.instagram` etc.).
  - Footer — reuses `siteConfig.contact.location`; "JCI Oriente · Desde 1993"
    static (not newly editable — YAGNI).
  - Styles — port the design CSS into spotlight `styles.css` using existing brand
    tokens (`--jci-blue/black/navy/teal/yellow`); add the ripple keyframes +
    glass/backdrop-blur card utilities.
- `apps/spotlight/src/site-config/use-site-config.ts` — add `linktree` to the
  `Resolved` type literal.
- `apps/spotlight/src/site-config/defaults.ts` — add a `linktree` default
  (sensible JCI links) so the page renders before/without backstage data.
- `apps/spotlight/src/components/footer.tsx` — add an `<li>` "Enlaces" →
  `/enlaces` to the "Sitio" column (after Programas), using the existing `go()`
  navigate handler. Replace its local `safeHref` with the shared helper.
- `apps/spotlight/src/site-config/safe-href.ts` (new) — shared runtime href
  neutralizer (`http(s):` + `mailto:`, else `#`), consumed by `footer.tsx` and
  `enlaces.tsx`.

## Testing (TDD)

- **Types/schema** — `linktree` schema accepts a valid doc; rejects a
  `javascript:` url; rejects an icon outside `LINKTREE_ICONS`; `mailto:` url
  accepted; (regression) the widened `safeUrl` still rejects `javascript:` for
  `contact.links` too.
- **safe-href helper** — passes through `https:`/`mailto:`, returns `#` for
  `javascript:` and other schemes.
- **Backstage mapper** — `toSiteConfigDoc(toSiteConfigInput(doc))` round-trips
  `linktree` (links order, flags, ids preserved); blank id gets generated.
- **Spotlight route** — renders only `active === true` links; `isPrimary` gets
  the primary class; `badge` renders when present; socials render; reduced-motion
  disables the ripple spin; links have accessible names.

## Scope / files

- `packages/types`: `site-config.ts`, `site-config-schema.ts`, `index.ts` (export
  `LINKTREE_ICONS`, types).
- `apps/backstage`: `site-config-form.tsx`, `site-config-mapper.ts` (+ tests).
- `apps/spotlight`: `routes/enlaces.tsx`, `styles.css`,
  `site-config/use-site-config.ts`, `site-config/defaults.ts`,
  `components/footer.tsx` (+ tests). Ripple reuses `@luminova/ui`.
- `docs/superpowers/specs/2026-06-22-linktree-enlaces-design.md` (this file).

**No** new dependencies, **no** Cloud Functions, **no** `firestore.rules` change.

## Out of scope (YAGNI)

- Per-link click analytics.
- Uploadable custom icons / per-link images.
- Editable footer "Desde 1993" / city.
- Multiple linktrees / scheduling.

## Edge cases

- `linktree` absent on old docs → spotlight uses `defaults.ts`.
- Empty `links` after active-filter → render an empty nav (no crash).
- Multiple `isPrimary` links → allowed (not enforced); design intends one.
- `badge` absent → no flag pill.
- All link/social urls go through `safeUrl` + `rel="noopener"`.
