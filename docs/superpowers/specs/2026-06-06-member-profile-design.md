# A5 — Member Profile / Points History — Design

_Date: 2026-06-06 · Branch: `feat/member-profile` · Status: approved_

## Goal

A read-only **member profile** in backstage: the board opens a member from the
table and sees their current-term recognition points — the `memberPoints`
aggregate (cumulative + monthly breakdown) and the per-activity `participations`
ledger. First backstage reader of the engine output (A2). First member-detail
route.

## Decisions (from brainstorm)

| Decision | Choice |
|---|---|
| Surface | New route `_app.members.$memberId.tsx` (board view). Self-view → B1 (deferred). |
| Data | `memberPoints/{memberId__termId}` (cumulative + byMonth) + `participations` (member+term). |
| Ledger source label | `POINT_RULE_LABELS[pointRuleCode]` — no activity-title join (deferred). |
| Rows shown | **All** states (transparency); `cumulative` counts confirmed only (matches `memberPoints`). |
| Term | Current term only (`currentTermId()`); multi-term selector deferred. |
| Rank | Deferred to A6. |

## Reads

No new Firestore rules (`participations` / `memberPoints` are already signed-in
read, F1). No new index — the `participations` query uses two equality filters
(`memberId ==`, `termId ==`), which Firestore serves without a composite index.

- **`MemberPointsRepository`** (`features/members/repositories/member-points-repository.ts`):
  `getByMemberAndTerm(memberId, termId): Promise<MemberPoints | null>` → `getDoc`
  of `memberPoints/{memberId}__{termId}`.
- **`ParticipationRepository`** (`features/members/repositories/participation-repository.ts`):
  `getByMemberAndTerm(memberId, termId): Promise<Participation[]>` → `query(where
  memberId ==, where termId ==)`, sorted in JS by `monthBucket` desc then
  `computedPoints` desc (newest month first, biggest first within a month).
- Reuse `MemberRepository.getById` for the header.

### Shared `currentTermId`

Move `currentTermId()` from `features/point-rules/lib/current-term.ts` to
`src/lib/current-term.ts` (+ its test) — it is cross-feature now (members + point
rules), and a feature must not import from another feature. Update the one A1
import in `routes/_app.point-rules.tsx`.

## Hooks (TanStack Query)

- `useMember(memberId)` — `member-keys.ts` gains `detail(id)`; `queryFn` =
  `MemberRepository().getById(id)`.
- `useMemberPoints(memberId, termId)` — key `['memberPoints', memberId, termId]`.
- `useMemberParticipations(memberId, termId)` — key `['participations', memberId, termId]`.

## Components

- **`MemberProfile` route** (`_app.members.$memberId.tsx`): reads the `$memberId`
  param + `currentTermId()`. Layout:
  - `PageHeader` (eyebrow "Miembro", title = member name) + a back-link to `/members`.
  - **Stat row:** total points this term (`memberPoints.cumulative ?? 0`), with the
    `status` `Badge`. (Rank omitted → A6.)
  - **Monthly breakdown:** `byMonth` rendered as a compact labelled bar list (or
    `@luminova/ui` `Sparkline` if ≥2 months) — keys sorted ascending.
  - **`ParticipationLedger`** (below).
  - States: loading → "Cargando…"; member not found → message + back-link; no
    points/rows → `EmptyState` "Sin puntos en esta gestión".
- **`ParticipationLedger`** (`features/members/components/participation-ledger.tsx`):
  `@luminova/ui` `Table` — columns **Fuente** (`POINT_RULE_LABELS[code]`), **Rol**
  (Spanish map: Director→"Director", CoDirector→"Codirector", Team→"Equipo",
  Attendee→"Asistente"), **Puntos** (`computedPoints`), **Estado** (`Badge` tone:
  confirmed→green "Confirmado", provisional→gray "Provisional", voided→red
  "Anulado"), **Mes** (`monthBucket`). Empty → `EmptyState`.
- **Members table link:** add a "Ver" `RowAction` (icon `compass` or similar) on
  each row linking to `/members/{id}`, gated `<Can I="read" a="Member">` — every
  role that reaches `/members` can read a member, so it shows for all of them.

## Testing

- `member-points-repository` / `participation-repository`: a small pure sort helper
  (`byMonthThenPoints`) unit-tested; repo classes themselves mirror `MemberRepository`
  (untested, thin Firestore access).
- `current-term` test moves with the file.
- `participation-ledger.test.tsx`: renders rows, the three state badges, the role
  labels, and the empty state.
- `member-profile` (route component) is exercised via the ledger + repository tests;
  if practical, a light render test of the populated/empty states.
- `pnpm --filter backstage run ci`. No beacon/auth/rules/functions touched → **no
  `/security-review` trigger**; `firestore-security-reviewer` not required (no rules
  or repository-write change — reads only).

## Out of scope / deferred

- Member **self-view** (`/profile`, member self-login) → B1.
- **Rank** / leaderboard position → A6.
- **Activity-title join** (ledger shows the rule label as the source) → later.
- **Multi-term** history + term selector → when Term admin lands.
- Provisional/confirmed **filter toggle** → if asked.
