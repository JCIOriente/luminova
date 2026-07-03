# Shared Firestore read mapper + parse-on-read (audit item 4)

**Branch:** `refactor/repo-read-mapper` · **Scope:** `apps/backstage` repositories + `@luminova/types` read-schemas. Read-path only — no `firestore.rules` change, no write-schema change.

## Problem

13 of 14 backstage repositories map Firestore docs with raw `as Omit<X,"id">` casts
(audit 2026-07 finding rows: architecture Low @ member-repository.ts:36, duplication
Medium @ ally-repository.ts:23, security Low @ member-repository.ts:30). The zod
schemas in `@luminova/types` are **form-input** schemas (dates as strings, no system
fields) — structurally incompatible with raw doc data, so nothing validates reads. A
raw-cast crash already shipped once (`joinDate` missing → `.toDate()` on undefined
deep in render).

## Decision 1 — parse policy (fail-observable, not fail-silent)

| Read kind | Policy | Rationale |
|---|---|---|
| List (`getDocs`) | `safeParse` per doc; malformed → `console.error` with collection, doc id, zod issues, then **skip the doc** | One legacy/corrupt doc must not blank an entire admin table. Skip is observable via the error log. |
| Single get (`getDoc`) | `parse` → throw typed `DocParseError` | Surfaces as the TanStack Query error state (components must have an `isError` branch — the infinite-skeleton gotcha) instead of a raw-cast crash inside render. |

No `onSnapshot` exists in backstage — one-shot reads only.

## Decision 2 — read-schemas ("doc schemas") in `@luminova/types`

One `<entity>-doc-schema.ts` per persisted entity, colocated with the entity type.
Form schemas stay untouched (never loosened). Compile-time drift lock on every doc
schema:

```ts
export const memberDocSchema = z.object({ ... }) satisfies z.ZodType<Omit<Member, "id">>;
```

Principles:

- **Shape only, no business constraints.** No `.min()`, `.email()`, `.url()`, no
  permission caps, no cross-field `superRefine`. Reads must accept everything any
  past writer legitimately produced; business rules are write-side (form schemas +
  firestore.rules).
- **Timestamps** are runtime class instances. `packages/types` has no runtime
  firebase dep, so validation is structural: `z.custom<Timestamp>` checking
  `toMillis`/`toDate` functions. Two typed variants over one shared predicate:
  engine-neutral `Timestamp` (engine entities) and client `Timestamp`
  (member/ally/position/role/site-config types).
- **Legacy defaults are explicit and enumerated** — only where absence is a known
  historical state, never for identity/enum/timestamp fields (those fail loudly;
  that is the point):

  | Field | Default | Why |
  |---|---|---|
  | `Activity.location` | `null` | pre-field docs (today's `parseActivity`) |
  | `Activity.photos` | `[]` | pre-photos-feature docs |
  | `Activity.hasCheckIns` | optional | beacon-only mirror, absent pre-feature |
  | `Member.gender` etc. | optional | pre-K2 docs (already optional in type) |
  | `Member.profilePicture` | `null` | pre-H1 docs |
  | `Member.totalPoints` | `0` | pre-engine docs |
  | `TermPositions.comisionIds` | `[]` | legacy slot (spread-throw class) |
  | `InitiativeCore.featured` | `false` | pre-feature docs (today's `initiativeToInput`) |
  | `InitiativeCore.photos` / `directionUids` | `[]` | pre-feature / engine-mirrored |
  | `InitiativeCore.impact` / `finalReport` | `null` | pre-completion-wizard docs |
  | `SiteConfig.linktree` | optional | pre-/enlaces docs (mapper still normalizes) |
  | check-in `checkInAt` | `null` | unresolved `serverTimestamp()` window |

- **PermissionCode fields** use the strict `permissionCodeSchema`. Trade-off: an
  older deployed client reading a doc that carries a newer permission code drops
  that row (logged). Accepted — codes change rarely and only via coordinated
  deploys.
- New schemas for entities that had none: `Term`, `MemberPoints`, `Participation`,
  plus a backstage-local schema for the `CheckInRecord` read projection.

## Decision 3 — one shared mapper in `apps/backstage/src/lib/firestore-read.ts`

```ts
parseDoc(schema, snap)      // -> { id, ...T } | throws DocParseError
parseDocData(schema, snap)  // -> T (no id injection — siteConfig singleton)
parseDocs(schema, snapshot) // -> ({ id, ...T })[]  (skip+log malformed)
```

Snapshot params typed structurally (`{ id, ref.parent.id, data() }`) so tests need
no Firestore fakes. Logging follows the `[backstage]` console convention
(`query-client.ts`). Existing `*-mapper.ts` files are **write** mappers — untouched.

## Rollout (13 repositories)

activity (replaces local `parseActivity`), ally, check-in, term, member,
member-points, participation, role, point-rule, position, program, project,
site-config. `member-permissions-repository` is write-only — untouched.
`site-config-mapper`'s `normalizeLinktree`/`normalizeSocials` normalization stays
(applies after parse).

## Non-goals

- Item 15 repository-naming / acting-uid cleanup — out of scope.
- Item 7 programs/projects merge — out of scope (both repos get the same wiring).
- No firestore.rules edits, no write-path changes, no new deps (zod 4.4.3 already in
  both packages).
- The 9 refuted audit findings and the deferred members rules-hardening stay
  untouched.

## Test plan (TDD, RED first)

1. `firestore-read.test.ts` — parseDoc happy/throw, parseDocs skip+log (spy), id
   injection, parseDocData.
2. One `<entity>-doc-schema.test.ts` per schema — valid doc parses, malformed doc
   fails (the field that would have raw-cast-crashed), each legacy default applies.
3. Full `pnpm --filter backstage run ci` + `pnpm --filter @luminova/types run ci`
   per batch; gates before PR: /simplify, /code-review high,
   /security-review + firestore-security-reviewer, bundle-budget-watcher (zod in
   index chunk — note gz delta vs docs/performance.md).
