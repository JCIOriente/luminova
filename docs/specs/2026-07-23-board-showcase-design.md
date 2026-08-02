# Board showcase — public Directiva projection

**Status:** approved (2026-07-23)
**Author:** Claude (with owner)

## Problem

The public site (`apps/spotlight`) `/about` "Comité Ejecutivo" section renders
hardcoded placeholder cards (`Nombre Apellido` / `Próximamente`) driven by the
static `CEL_POSITION_TITLES` array. Real leadership data (photo + name + role)
lives only in the auth-gated `members` collection, which the no-auth spotlight
app cannot read (`firestore.rules` `members` read requires `canDo('read','Member')`).

We want spotlight to show the real, current-term leadership — Comité Ejecutivo
(CEL) **and** Direcciones (JDL) — with photos, names, and roles, without leaking
member PII or the RBAC `grants` taxonomy to the public bundle.

## Approach — curated public projection (mirrors `allyShowcase`)

Beacon (admin SDK) maintains a world-read `boardShowcase` collection holding
**public fields only**. Spotlight reads it lite, unauthenticated. This is the
exact pattern already used for `allyShowcase` (`onAllyWritten` → `projectAlly`).

The projection carries **both CEL and JDL** from day one so the "show all
directors" phase is a spotlight UI change, not a second backend migration.
Comisión positions are chip-only and never projected.

### Data model — `packages/types/src/engine/board-public.ts`

Plain TS interface (zero zod — the `/engine` subpath stays raw-Node-ESM valid for
beacon), mirroring `AllyShowcaseItem`:

```ts
export const BOARD_GROUPS = ["CEL", "JDL"] as const;
export type BoardGroup = (typeof BOARD_GROUPS)[number];

export interface BoardShowcaseItem {
  id: string;          // == member doc id
  name: string;
  title: string;       // gender-aware Spanish role title, e.g. "Secretaria"
  group: BoardGroup;   // CEL | JDL — drives spotlight grouping
  rank: number;        // gender-invariant sort rank (CEL 0..7 by statutory order; JDL 1000)
  portraitUrl: string; // host-constrained Firebase Storage download URL
}
```

`rank` is emitted by beacon (`boardRank`) from the cargo's **base** title, because the
displayed `title` is gender-aware and cannot be reverse-matched to statutory order on
the public side. Spotlight sorts by `rank`, then by `name` (JDL tie-break).

`boardGroupFromCategory(category): BoardGroup | null` maps a `Position.category`
(`"CEL" | "JDL" | "Comision"`) to the projected group, `null` for Comisión.

Gender-aware titles reuse a single source of truth: `femaleTitle` + a new
`genderedTitle(title, titleFemale, gender)` move to `packages/types/src/engine/title.ts`
(pure), and `position.ts` `positionTitle`/`femaleTitle` delegate to it — no drift.

### Consent — `Member.publicProfile?: boolean`

A member controls publication via a toggle on their own `/me` credential page, and
is the ONLY principal who may change it — the member writes it through the existing
self-service lane; `firestore.rules` forbids the key on create from every client and
pins it with `unchanged()` on every institutional update arm.

**Membership standing.** `Activo` and `Inactivo` both publish — a suspended member still
holds their cargo for the term, and the board page states who holds each post. Only
`Desafiliado` drops (and it must be checked explicitly: `setStatus` writes `status` alone
and leaves `active: true`, so an expelled member is not soft-deleted). The check is an
allowlist, so any status added to `MEMBER_STATUSES` later stays unpublished until someone
decides otherwise. Docs with no `status` at all predate the field and still publish.

**Accepted consequence of opt-out.** The institutional tier can compose a publication
without any act by the member: it may upload a portrait (`storage.rules` lets
Admin/Membership write `members/{id}/profile.jpg`), point `profilePicture` at it, and
assign a board cargo — the stamped default supplies the consent gate. The `uid`
requirement guarantees the member always has a reachable `/me` opt-out, but they are
published before exercising it. Requiring a member signal first would be opt-in, i.e. the
prior design. If this becomes unacceptable, the cheapest partial mitigation is pinning
`profilePicture` on the institutional update arm so the portrait half is member-owned.

**Amended 2026-08-01 (opt-out default).** New members are created publishable: the
key is absent at create and beacon's `onMemberCreated` stamps
`PUBLIC_PROFILE_DEFAULT = true` server-side. The default is stamped by the trigger,
never by a client, so no creator can publish a person by authoring a doc. Members
created before that change keep an absent field, which every consumer still reads as
NOT published (`project-board.ts` uses `!== true`) — flipping those would be a
consent decision requiring a deliberate backfill, not a read-time default.

### Photo — reuse the existing profile picture URL (no copy)

`Member.profilePicture` already holds a tokened `getDownloadURL()` URL
(`firebasestorage.googleapis.com/v0/b/<bucket>/o/members%2F<id>%2Fprofile.jpg?alt=media&token=<uuid>`).
A tokened Firebase Storage download URL renders publicly regardless of Storage
security rules (the token is the capability), so the projection exposes that URL
directly — no blob copy, no new Storage path, no `storage.rules` change. The URL
is **pinned to this project's own bucket AND this member's own object** —
`https://firebasestorage.googleapis.com/v0/b/<projectId>.(appspot.com|firebasestorage.app)/o/members%2F<id>%2Fprofile.jpg`
(`isMemberPhotoUrl`, projectId from `GCLOUD_PROJECT`). A bare hostname allowlist is
insufficient: `firebasestorage.googleapis.com` is shared by every Firebase project,
so an insider could otherwise point the public `<img>` at an attacker-controlled
bucket via a direct member write. `cargoId` is likewise rejected if it contains `/`
(it flows into a `positions/${cargoId}` doc-path template).

### Beacon trigger — `onBoardMemberWritten` (`members/{id}`)

Separate from `onMemberWritten` (claims-sync) to isolate concerns. On any member
write, `projectBoard` decides publish-or-remove. A member is projected **iff all**:

- `publicProfile === true`
- current-term (`positions[currentTermKey()]`) `cargoId` resolves to a `Position`
  whose `category` is `CEL` or `JDL` (read `positions/{cargoId}`)
- `profilePicture` is a host-constrained Storage URL

On qualify → `set boardShowcase/{id}`. On not-qualify / delete / opt-out →
`delete boardShowcase/{id}`. Errors are swallowed + logged (no retry storm;
self-heals on next member write), exactly like `onAllyWritten`.

Pure decision (`projectBoard`) is unit-tested with synthetic input; the one
Firestore read (`positions/{cargoId}`) is injected so the pure core stays
framework-free.

### Rules — `firestore.rules`

```
match /boardShowcase/{id} {
  allow read: if true;
  allow write: if false;
}
```

Self-lane gains `publicProfile`: `selfProfileValid` `hasOnly([... , 'publicProfile'])`
+ `is bool` guard; mirrored in `selfProfileSchema` and the
`member-self-lane.rules.test.ts` drift test.

### Spotlight — `apps/spotlight/src/board/`

`board-showcase-firestore.ts` (lite `getDocs`) + `use-board.ts`
(SWR-over-localStorage, Timestamp-free identity cache) mirroring `allies/`.
Ordering lives here: CEL group before JDL; within CEL by `CEL_POSITION_TITLES`
index; within JDL by title locale sort. `about.tsx` renders the "El Masthead"
design (President hero + CEL ledger + JDL chips), published members only, with
structural graceful degradation (vacant roles/empty groups never render).

## PR stack

1. **`feat/board-showcase`** — types + beacon projection + `boardShowcase` rules.
2. **`feat/board-consent-toggle`** (stacked) — `publicProfile` self-lane: schema,
   rules, backstage `/me` toggle.
3. **`feat/directiva-page`** (stacked) — spotlight `board/` reader + "El Masthead"
   redesign.

## Reviews per PR

- PR1: `firebase-functions-reviewer`, `firestore-security-reviewer`, `/security-review`.
- PR2: `firestore-security-reviewer`, `/security-review`, `react-best-practices`.
- PR3: `react-best-practices`, `ui-ux-pro-max`, `bundle-budget-watcher`.

## Non-goals

- No blob copy / separate public portrait upload (reuse profile picture URL).
- Comisión positions are not projected.
- No realtime; spotlight reads one-shot on visible, cached.
