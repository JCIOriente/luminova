# 0008. Server-written public projections

**Status:** Accepted
**Date:** 2026-06-21 (`allyShowcase`); pattern established earlier by `showcase`
**Source:** `docs/specs/2026-06-21-public-allies-design.md`, "Why this is
multi-boundary"; `docs/specs/2026-07-23-board-showcase-design.md`; `firestore.rules`.

## Context

The public site is anonymous and reads through the lite SDK
([0004](0004-lite-sdk-for-spotlight.md)), so it can only read **world-readable**
collections. The data it wants to display lives in collections that must not be world
readable.

The allies case states the problem exactly. `Ally` is an admin CRM record —
`companyName`, `contactPerson`, `phone`, `email`. The public site wants to show a wall
of logos. Opening `/allies` for public read would have published the contact person's
name, phone number and email of every partner organization.

The same shape recurs for programs and projects (members, rosters, internal notes) and
for the board (member records behind each seat).

## Decision

For each public surface, beacon maintains a **separate, curated, world-read projection**
containing only public fields. Clients never write them.

| Projection | Source | Written by |
|---|---|---|
| `showcase` | programs, projects, activity photos | `onProgramWritten`, `onProjectWritten`, `onActivityWritten` |
| `allyShowcase` | allies | `onAllyWritten` |
| `boardShowcase` | the term's board roster | `onBoardMemberWritten` |

`AllyShowcaseItem` is the pattern in miniature: `id`, `name`, `logoUrl`, `category` —
and nothing else. The CRM fields are structurally absent, not merely unqueried.

The projection also skips incomplete records. An ally without a logo or category simply
does not appear, which avoided a migration when the fields were added.

## Consequences

**Easy:** the public site reads one small document per surface — fast, and cheap; a
field added to the private record is private by default, because it has to be added to
the projection deliberately; no rule has to enumerate which fields of a shared
collection are public, because publicness is a property of the collection.

**Hard:**

- **Everything public is eventually consistent.** Edit an ally, and the wall updates
  after the trigger runs.
- **Every public surface costs a trigger.** Four of beacon's triggers exist only to
  maintain projections.
- **A projection can be orphaned.** A collection whose consumer was removed keeps being
  written and keeps being world-readable. Guardrail 6 requires removing orphaned
  `firestore.rules` collections; one (`board`) has already been removed for this reason.
- **URLs in projections need their own validation.** `logoUrl` is https-only with a host
  allowlist, and portrait URLs are pinned to the project's own bucket and object —
  otherwise a world-read document becomes an open redirect or a tracking vector.

**Ruled out:** field-level public read on the private collections. Rules would have had
to enumerate readable fields per collection — fragile, and one missed field is a leak.
