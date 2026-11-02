# Public member profile

**Status:** approved (2026-11-01)
**Author:** Claude (with owner)

## Problem

Spotlight names members in two places, the Directiva on `/about` and the team credits on
`/impacto/$id`, and neither says who the person is. The chapter wants to recognize each
member's career: clicking a person opens a designed modal with their photo, their positions
by term and the projects they led or worked on.

Only `boardShowcase` (current board) and `showcase` (name and photo per finished project)
are public. A team member outside the board has no public record at all.

## Approach

A new curated projection, `memberShowcase/{memberId}`, following
`docs/decisions/0008-server-side-public-projections.md`: beacon writes it, the world reads
it, no client writes it. Spotlight reads one document when the modal opens.

### Data model: `packages/types/src/engine/member-public.ts`

```ts
export interface MemberShowcaseItem {
  id: string;
  name: string;
  portraitUrl: string | null; // pinned to this member's own Storage object
  profession: string | null;
  joinYear: number | null;
  bio: string | null; // written by the member, at most 180 characters
  linkedinUrl: string | null; // https linkedin.com/in/ only
  isPastPresident: boolean;
  career: { year: string; title: string }[]; // most recent first
  projects: {
    id: string;
    title: string;
    year: number;
    role: "Director" | "CoDirector" | "Team";
    personsImpacted: number;
  }[]; // most recent first
}
```

The card's stats (years in JCI, projects led, projects in total) are derived in spotlight.
Commission assignments stay out of `career`: they are chip-only positions, as on the board.

Left out on purpose: email, phone and birthdate (scraping and identity verification), points
and attendance (a low number shames newer members, against the purpose of the page), and
Best Member (`terms.bestMemberId` is defined, but nothing sets it yet).

### Consent

`memberShowcase` uses the gates of `boardShowcase`, extracted into one predicate:
`publicProfile === true`, a `uid` so the `/me` opt-out is reachable, not soft-deleted, a
surfaceable status and a name. There is no cargo gate and no photo gate: a member without a
photo gets initials. `portraitUrl` keeps the bucket and object pin of `projectBoard`.

Team credits are older and do not read `publicProfile`, so an opted-out member's name and
photo stay on past projects. That behavior is unchanged here. Their credit carries an id but
`memberShowcase` holds no document, so the modal shows "Este perfil no está disponible".

### `showcase` changes

`ShowcasePerson` gains `id`, and `ShowcaseItem` gains `memberIds`, so a credit can open a
profile and the projection can find a member's projects with one `array-contains` query.
Both are optional in the type: documents written before this change lack them until the
backfill, and spotlight renders such a credit as plain text.

### Beacon

`syncMemberShowcase(database, memberId, projectId)` runs a transaction on the live member
doc, the same ordering rule as `boardShowcase`, and writes or deletes the projection.

- **Member writes:** `onBoardMemberWritten` calls it after the board projection, so
  `retry: true` also covers the opt-out. No new deployed function. `members.totalPoints`
  changes on every check-in, so a write that leaves every projected field equal is skipped
  (`memberProjectionUnchanged`). Skipping is safe: the event that changes a relevant field
  makes its own call.
- **Initiative writes:** after `projectShowcase`, each member on the roster before or after
  the write is synced, so a removal also drops the project from that profile.
- **Bounds:** at most 100 projects per member and 40 terms.
- **Known gap:** a cargo title edit in `positions/` does not re-project holders, as with
  `boardShowcase`. `career` keeps every term, so the UTC-year rollover needs no fix here.

### Backfill

`reprojectPublicProfiles` is an Admin-only callable (`guardedOnCall`), called by hand by the
owner like `recomputeAllClaims`. It re-projects every program and project, then every member,
and returns `{ ok, showcases, members, failed }`. `ok` is true only when `failed` is empty.

### Fields on `Member`

`bio` and `linkedinUrl`, both optional, join the self lane on `/me` and the admin form.
`firestore.rules` caps them (`selfProfileValid`, 180 and 200 characters; the URL pattern is
anchored to `https://(www.)linkedin.com/in/`), and beacon validates again because the field
is untrusted input at a public boundary.

### Spotlight

- `?miembro=<id>` on the root route drives the modal, so a profile is shareable and
  back-button dismissal works. It is validated as a safe id before any read.
- The modal is lazy-loaded, reads one document through the lite SDK and handles loading,
  error and absent.
- It uses the `Dialog` from `@luminova/ui`. Visuals follow the "Perfil público de miembro"
  design canvas: panel + sheet on desktop, compact header on phones, a shorter card for a
  member with little history.
- Directiva portraits and rows, and team credits with an id, become real buttons.
