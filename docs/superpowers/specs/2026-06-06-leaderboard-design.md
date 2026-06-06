# A6 — Leaderboard / Recognition Surface — Design

_Date: 2026-06-06 · Branch: `feat/leaderboard` · Status: approved_

## Goal

A backstage leaderboard that ranks members by recognition points for the current
term — **annual** (cumulative) and **monthly** (top 3 + "Mejor del Mes") — reading
the engine's `memberPoints` aggregates, with eligibility flags applied. The
engagement surface of the Recognition Engine. (Public member-facing self-view →
B1; this is the board page.)

## Decisions (from brainstorm)

| Decision | Choice |
|---|---|
| Scope | **Annual + monthly** on one page (view toggle: Anual + each month in `byMonth`). |
| Data composition | **Composed `useQuery` hooks** (reuse cached `useMembers`; `useMemberPointsByTerm`; `useTerm` ×2) — NOT a single `Promise.all` query. Per-read caching/refetch + cache reuse. |
| Eligibility | Wire `evaluateEligibility` (exclude CEL / past-president / previous-winner). Inert in v1 (empty `Term.board`, no prev term) → auto-activates with Term admin. |
| Surface | New `/leaderboard` route + nav, **ungated** (public to all members; `memberPoints` is signed-in read). |
| Tiebreak | `cumulative`/month value desc, then member name asc. Social-media tiebreak deferred. |

## Reads

No rules change (`memberPoints` and `terms` are already signed-in read, F1). The
`memberPoints` term query is single-field (`termId ==`) → auto-indexed.

- **`MemberPointsRepository.getAllByTerm(termId): Promise<MemberPoints[]>`** — add to
  the existing `features/members/repositories/member-points-repository.ts`:
  `query(collection memberPoints, where('termId','==',termId))`.
- **`MemberRepository.getAll()`** — reuse (names, `isPastPresident`, `status`, `active`).
- **`TermRepository.getById(termId): Promise<Term | null>`** — new
  `features/leaderboard/repositories/term-repository.ts` (`getDoc(terms/{termId})`,
  `{ id, ...data }`). Minimal; the future Term-admin feature takes ownership.

## Pure ranking — `features/leaderboard/leaderboard.ts` (TDD)

```ts
export interface LeaderboardEntry {
  rank: number;
  memberId: string;
  name: string;
  points: number;
  isBestOfMonth: boolean;
}

interface RankContext {
  points: MemberPoints[];
  membersById: Map<string, Member>;
  currentTerm: Term | null;
  previousTerm: Term | null;
}
```

- **`eligibleEntries(ctx, valueOf)`** (internal): for each `MemberPoints`, look up the
  member; skip if missing or `active === false`; compute `value = valueOf(mp)`; skip if
  `value <= 0`; skip unless `currentTerm` is null OR
  `evaluateEligibility({ memberId, isPastPresident: member.isPastPresident ?? false,
  currentTerm, previousTerm }).canCompete`. (When `currentTerm` is null we can't judge
  CEL/winner, so include — defensive; in practice the term exists.)
- **`rankAnnual(ctx): LeaderboardEntry[]`** — `valueOf = mp.cumulative`; sort by
  `points` desc then `name` (`localeCompare es`); `rank = i + 1`; `isBestOfMonth = false`.
- **`rankMonthly(ctx, month): LeaderboardEntry[]`** — `valueOf = mp.byMonth[month] ?? 0`;
  same sort + rank; `isBestOfMonth = rank === 1`.
- **`monthsPresent(points): string[]`** — union of all `byMonth` keys, sorted desc
  (newest first) — drives the view toggle.

Pure (no Firestore); `Member`/`MemberPoints`/`Term` from `@luminova/types`,
`evaluateEligibility` from `@luminova/types/engine`.

## Hooks (composed)

- Reuse `useMembers()` (members feature — already cached by the table).
- `useMemberPointsByTerm(termId)` (members feature) — key `['memberPoints','term',termId]`.
- `useTerm(id)` (leaderboard feature) — key `['terms', id]`; returns `Term | null`.

## Components / route

- **`_app.leaderboard.tsx`:** `const termId = currentTermId(); const prevId =
  String(Number(termId) - 1);`. Compose `useMembers`, `useMemberPointsByTerm(termId)`,
  `useTerm(termId)`, `useTerm(prevId)`. `isPending = any pending`, `isError = any error`.
  Build `ctx` (`membersById` from the members list) + `months = monthsPresent(points)`.
  `view` state: `'annual' | month`. Derive entries with `useMemo` (`rankAnnual` /
  `rankMonthly(ctx, view)`). Render: `PageHeader` eyebrow "Reconocimiento" title
  "Clasificación"; a **view toggle** (segmented: "Anual" + each month label); the
  `LeaderboardTable`. Loading → "Cargando…"; error → message; no entries → `EmptyState`.
- **`LeaderboardTable`** (`features/leaderboard/components/leaderboard-table.tsx`):
  `@luminova/ui` `Table` — columns **#** (rank; 1–3 get a medal accent via a small
  tinted `Badge`/span — gold/silver/bronze tones using existing tokens), **Miembro**
  (name), **Puntos** (`points`, `tabular-nums`), and for the monthly view a **"Mejor del
  Mes"** `Badge` on the `isBestOfMonth` row. `EmptyState` ("Aún no hay puntos en esta
  gestión") when `entries=[]`.
- **Nav** (`components/nav-config.ts`): add `{ to: "/leaderboard", label: "Clasificación",
  icon: "barChart" }` — **no `subject`** (public). Extend the `to` union. Update
  `nav-config.test.ts`.

## Testing

- `leaderboard.test.ts` (pure): annual order + rank; monthly value + best-of-month;
  exclude a CEL member (via `currentTerm.board` flag); exclude `isPastPresident`;
  exclude previous-winner (`previousTerm.bestMemberId`); skip inactive / missing /
  zero-value members; name tiebreak; `monthsPresent` union+desc.
- `leaderboard-table.test.tsx`: ranks render, top-3 accent, "Mejor del Mes" on the
  monthly #1, empty state.
- `nav-config.test.ts`: leaderboard item present, no subject.
- Repos thin (untested, like the others). `pnpm --filter backstage run ci`.
- **No `/security-review` trigger** (read-only; no rules/beacon/auth/repository-write).

## Out of scope / deferred

- **Social-media tiebreaker** (likes/comments/shares, manual entry) → low-priority.
- **Member-facing** public surface / self-view → B1.
- **Stored monthly winners** + annual `bestMemberId` (set at term close) → Term admin.
- **Multi-term** history / term picker → Term admin.
- Real **avatars** / podium graphics → polish later (rank uses a tinted badge accent).
