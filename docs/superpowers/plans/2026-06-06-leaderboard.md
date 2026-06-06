# Leaderboard (A6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Backstage `/leaderboard` ranking members by current-term points — annual (cumulative) + monthly (top 3 + Mejor del Mes), eligibility-filtered, composed read hooks.

**Architecture:** pure `leaderboard.ts` ranking (uses `evaluateEligibility`) + read repos (`MemberPointsRepository.getAllByTerm`, new `TermRepository`) + composed `useQuery` hooks + `LeaderboardTable` + route + nav. No rules/beacon change.

---

## Task 1: Reads — `getAllByTerm` + `TermRepository`

- [ ] Add to `features/members/repositories/member-points-repository.ts`:

```ts
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
// ...existing getByMemberAndTerm...
  async getAllByTerm(termId: string): Promise<MemberPoints[]> {
    const snapshot = await getDocs(
      query(collection(this.db, "memberPoints"), where("termId", "==", termId)),
    );
    return snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MemberPoints, "id">) }));
  }
```

(Adjust imports — the file currently imports `doc, getDoc`; add `collection, getDocs, query, where`.)

- [ ] Create `features/leaderboard/repositories/term-repository.ts`:

```ts
import { doc, getDoc } from "firebase/firestore";
import { getFirebase } from "@luminova/firebase";
import type { Term } from "@luminova/types";

export class TermRepository {
  private readonly db = getFirebase().db;

  async getById(termId: string): Promise<Term | null> {
    const snapshot = await getDoc(doc(this.db, "terms", termId));
    if (!snapshot.exists()) return null;
    return { id: snapshot.id, ...(snapshot.data() as Omit<Term, "id">) };
  }
}
```

- [ ] `tsc --noEmit` clean; commit `feat(backstage): memberPoints-by-term + term read repositories`.

---

## Task 2: Pure ranking `leaderboard.ts` (TDD)

**Files:** `features/leaderboard/leaderboard.ts` + `.test.ts`.

- [ ] **Test** covers: annual order+rank; monthly value+best-of-month; exclude CEL (board flag), past-president, previous-winner; skip inactive/missing/zero; name tiebreak; `monthsPresent` desc. Example skeleton:

```ts
import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase/firestore";
import type { Member } from "@luminova/types";
import type { MemberPoints, Term } from "@luminova/types";
import { rankAnnual, rankMonthly, monthsPresent } from "./leaderboard";

function member(id: string, name: string, extra: Partial<Member> = {}): Member {
  return {
    id, name, email: `${id}@x.bo`, role: "Miembro",
    joinDate: Timestamp.fromDate(new Date("2020-01-01T00:00:00Z")),
    birthdate: Timestamp.fromDate(new Date("1990-01-01T00:00:00Z")),
    status: "Activo", profilePicture: null, totalPoints: 0, active: true, deletedAt: null, ...extra,
  };
}
function mp(memberId: string, cumulative: number, byMonth: Record<string, number> = {}): MemberPoints {
  return { id: `${memberId}__2026`, memberId, termId: "2026", cumulative, byMonth,
    updatedAt: Timestamp.fromDate(new Date("2026-06-06T00:00:00Z")) };
}
function term(over: Partial<Term> = {}): Term {
  return { id: "2026", board: [], conventionDate: null, pointsCutoffAt: null, bestMemberId: null, status: "Activo", ...over };
}

const membersById = new Map([
  ["a", member("a", "Ana")], ["b", member("b", "Bruno")], ["c", member("c", "Carla")],
]);

describe("rankAnnual", () => {
  it("ranks by cumulative desc with name tiebreak", () => {
    const out = rankAnnual({ points: [mp("a", 10), mp("b", 30), mp("c", 30)], membersById, currentTerm: term(), previousTerm: null });
    expect(out.map((e) => [e.rank, e.name, e.points])).toEqual([[1, "Bruno", 30], [2, "Carla", 30], [3, "Ana", 10]]);
  });
  it("excludes CEL, past-president, previous winner, inactive, and zero", () => {
    const m = new Map(membersById);
    m.set("p", member("p", "Pedro", { isPastPresident: true }));
    m.set("d", member("d", "Diego", { active: false }));
    const currentTerm = term({ board: [{ memberId: "b", title: "Presidenta", isExecutiveCommittee: true }] });
    const previousTerm = term({ id: "2025", bestMemberId: "c" });
    const out = rankAnnual({
      points: [mp("a", 10), mp("b", 99), mp("c", 50), mp("p", 40), mp("d", 5), mp("x", 0)],
      membersById: m, currentTerm, previousTerm,
    });
    expect(out.map((e) => e.name)).toEqual(["Ana"]); // b=CEL, c=prevWinner, p=pastPres, d=inactive, x=zero/missing
  });
});

describe("rankMonthly", () => {
  it("ranks by the month value and flags the best of month", () => {
    const out = rankMonthly(
      { points: [mp("a", 30, { "2026-06": 5 }), mp("b", 10, { "2026-06": 12 })], membersById, currentTerm: term(), previousTerm: null },
      "2026-06",
    );
    expect(out.map((e) => [e.rank, e.name, e.points, e.isBestOfMonth])).toEqual([[1, "Bruno", 12, true], [2, "Ana", 5, false]]);
  });
});

describe("monthsPresent", () => {
  it("unions byMonth keys newest first", () => {
    expect(monthsPresent([mp("a", 1, { "2026-05": 1, "2026-07": 2 }), mp("b", 1, { "2026-06": 3 })])).toEqual(["2026-07", "2026-06", "2026-05"]);
  });
});
```

- [ ] **Impl** `leaderboard.ts`:

```ts
import type { Member, MemberPoints, Term } from "@luminova/types";
import { evaluateEligibility } from "@luminova/types/engine";

export interface LeaderboardEntry {
  rank: number;
  memberId: string;
  name: string;
  points: number;
  isBestOfMonth: boolean;
}

export interface RankContext {
  points: MemberPoints[];
  membersById: Map<string, Member>;
  currentTerm: Term | null;
  previousTerm: Term | null;
}

function competes(member: Member, ctx: RankContext): boolean {
  if (ctx.currentTerm === null) return true;
  return evaluateEligibility({
    memberId: member.id,
    isPastPresident: member.isPastPresident ?? false,
    currentTerm: ctx.currentTerm,
    previousTerm: ctx.previousTerm,
  }).canCompete;
}

function ranked(ctx: RankContext, valueOf: (mp: MemberPoints) => number, bestOfMonth: boolean): LeaderboardEntry[] {
  const rows = ctx.points
    .map((mp) => ({ member: ctx.membersById.get(mp.memberId), points: valueOf(mp) }))
    .filter((r): r is { member: Member; points: number } => r.member !== undefined && r.member.active && r.points > 0)
    .filter((r) => competes(r.member, ctx))
    .sort((x, y) => (y.points !== x.points ? y.points - x.points : x.member.name.localeCompare(y.member.name, "es")));
  return rows.map((r, i) => ({
    rank: i + 1, memberId: r.member.id, name: r.member.name, points: r.points,
    isBestOfMonth: bestOfMonth && i === 0,
  }));
}

export function rankAnnual(ctx: RankContext): LeaderboardEntry[] {
  return ranked(ctx, (mp) => mp.cumulative, false);
}

export function rankMonthly(ctx: RankContext, month: string): LeaderboardEntry[] {
  return ranked(ctx, (mp) => mp.byMonth[month] ?? 0, true);
}

export function monthsPresent(points: MemberPoints[]): string[] {
  const set = new Set<string>();
  for (const mp of points) for (const key of Object.keys(mp.byMonth)) set.add(key);
  return [...set].sort((a, b) => (a < b ? 1 : -1));
}
```

- [ ] `vitest run` → PASS; commit `feat(backstage): pure leaderboard ranking`.

---

## Task 3: Hooks

- [ ] `features/members/hooks/use-member-points-by-term.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { MemberPointsRepository } from "../repositories/member-points-repository";

export function useMemberPointsByTerm(termId: string) {
  return useQuery({
    queryKey: ["memberPoints", "term", termId],
    queryFn: () => new MemberPointsRepository().getAllByTerm(termId),
  });
}
```

- [ ] `features/leaderboard/hooks/use-term.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { TermRepository } from "../repositories/term-repository";

export function useTerm(id: string) {
  return useQuery({ queryKey: ["terms", id], queryFn: () => new TermRepository().getById(id) });
}
```

- [ ] `tsc --noEmit` clean; commit `feat(backstage): leaderboard read hooks`.

---

## Task 4: `LeaderboardTable` (TDD)

**Files:** `features/leaderboard/components/leaderboard-table.tsx` + `.test.tsx`.

- [ ] **Test:** renders rank/name/points; top-3 accent present; "Mejor del Mes" badge on `isBestOfMonth`; empty state for `[]`.
- [ ] **Impl:** `@luminova/ui` `Table`; rank cell shows a tinted `Badge` for 1 (amber/"navy"), 2, 3 else plain number; a `Badge tone="amber"` "Mejor del Mes" when `entry.isBestOfMonth`. `EmptyState title="Aún no hay puntos en esta gestión"` when empty.
- [ ] `vitest run` → PASS; commit `feat(backstage): leaderboard table`.

---

## Task 5: Route `_app.leaderboard.tsx`

- [ ] Implement per spec §components: compose `useMembers`, `useMemberPointsByTerm(termId)`, `useTerm(termId)`, `useTerm(prevId)`; `isPending`/`isError` via any; build `membersById`; `months = monthsPresent(points)`; `view` state (`"annual"|month`); `useMemo` entries (`rankAnnual`/`rankMonthly`); view toggle (buttons: "Anual" + each month); `LeaderboardTable`. Loading/error/empty states.
- [ ] `pnpm --filter backstage exec vite build` (regen routeTree), then `build` clean.
- [ ] Commit `feat(backstage): leaderboard route` (+ routeTree.gen.ts).

---

## Task 6: Nav entry (TDD)

- [ ] `nav-config.test.ts`: paths now end with `/leaderboard`; add a case asserting the item has **no subject** (public).
- [ ] `nav-config.ts`: extend `to` union with `"/leaderboard"`; add `{ to: "/leaderboard", label: "Clasificación", icon: "barChart" }` (place in a "Reconocimiento" group, or append to "Gestión" — use a new group `{ label: "Reconocimiento", items: [point-rules?, leaderboard] }`? Keep simple: append to "Gestión"). Update the `navItemForPath`/groups test expectations accordingly.
- [ ] `vitest run` → PASS; commit `feat(backstage): sidebar entry for the leaderboard`.

---

## Task 7: Verify

- [ ] `pnpm --filter backstage run ci`; `pnpm format`; `pnpm knip`.
- [ ] Update memory `project-luminova-v2.md` with the A6 entry.
- No `/security-review` trigger.

## Self-review
Spec coverage: reads (T1), pure ranking + eligibility (T2), composed hooks (T3), table (T4), route w/ toggle (T5), nav ungated (T6). Names: `getAllByTerm`, `TermRepository.getById`, `rankAnnual`/`rankMonthly`/`monthsPresent`/`RankContext`/`LeaderboardEntry`, `useMemberPointsByTerm`, `useTerm`, `LeaderboardTable`. No placeholders.
