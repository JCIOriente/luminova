# Member Profile / Points History (A5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Read-only member profile route in backstage showing current-term points (`memberPoints` cumulative + byMonth) and the `participations` ledger.

**Architecture:** New read repositories + hooks (mirror members), a `ParticipationLedger` component, a `_app.members.$memberId` route; shared `currentTermId` moved to `src/lib`. No rules/beacon change.

**Tech Stack:** React 19, TanStack Router/Query, `@luminova/types/engine`, `@luminova/ui`, vitest + RTL.

---

## Task 1: Move `currentTermId` to a shared lib

**Files:** move `apps/backstage/src/features/point-rules/lib/current-term.ts` (+ `.test.ts`) → `apps/backstage/src/lib/current-term.ts` (+ test). Update import in `routes/_app.point-rules.tsx` (`../features/point-rules/lib/current-term` → `../lib/current-term`).

- [ ] Move both files (content unchanged), update the one import, delete the now-empty `features/point-rules/lib/` dir.
- [ ] `pnpm --filter backstage exec vitest run src/lib/current-term.test.ts` → PASS.
- [ ] Commit `refactor(backstage): move currentTermId to shared src/lib`.

---

## Task 2: Read repositories + pure sort helper (TDD on the helper)

**Files:**
- Create `features/members/repositories/participation-sort.ts` + `.test.ts`
- Create `features/members/repositories/member-points-repository.ts`
- Create `features/members/repositories/participation-repository.ts`

- [ ] **Test** `participation-sort.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Participation } from "@luminova/types/engine";
import { byMonthThenPoints } from "./participation-sort";

function row(p: Partial<Participation>): Participation {
  return { monthBucket: "2026-06", computedPoints: 1, ...(p as Participation) };
}

describe("byMonthThenPoints", () => {
  it("orders newest month first, then highest points", () => {
    const out = [
      row({ monthBucket: "2026-05", computedPoints: 9 }),
      row({ monthBucket: "2026-07", computedPoints: 2 }),
      row({ monthBucket: "2026-07", computedPoints: 8 }),
    ]
      .slice()
      .sort(byMonthThenPoints)
      .map((r) => [r.monthBucket, r.computedPoints]);
    expect(out).toEqual([
      ["2026-07", 8],
      ["2026-07", 2],
      ["2026-05", 9],
    ]);
  });
});
```

- [ ] **Impl** `participation-sort.ts`:

```ts
import type { Participation } from "@luminova/types/engine";

/** Newest month first, then highest computedPoints within a month. */
export function byMonthThenPoints(a: Participation, b: Participation): number {
  if (a.monthBucket !== b.monthBucket) return a.monthBucket < b.monthBucket ? 1 : -1;
  return b.computedPoints - a.computedPoints;
}
```

- [ ] **Impl** `member-points-repository.ts`:

```ts
import { doc, getDoc } from "firebase/firestore";
import { getFirebase } from "@luminova/firebase";
import type { MemberPoints } from "@luminova/types/engine";

export class MemberPointsRepository {
  private readonly db = getFirebase().db;

  async getByMemberAndTerm(memberId: string, termId: string): Promise<MemberPoints | null> {
    const snapshot = await getDoc(doc(this.db, "memberPoints", `${memberId}__${termId}`));
    if (!snapshot.exists()) return null;
    return { id: snapshot.id, ...(snapshot.data() as Omit<MemberPoints, "id">) };
  }
}
```

- [ ] **Impl** `participation-repository.ts`:

```ts
import { collection, getDocs, query, where } from "firebase/firestore";
import { getFirebase } from "@luminova/firebase";
import type { Participation } from "@luminova/types/engine";
import { byMonthThenPoints } from "./participation-sort";

export class ParticipationRepository {
  private readonly collection = collection(getFirebase().db, "participations");

  async getByMemberAndTerm(memberId: string, termId: string): Promise<Participation[]> {
    const snapshot = await getDocs(
      query(this.collection, where("memberId", "==", memberId), where("termId", "==", termId)),
    );
    return snapshot.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Participation, "id">) }))
      .sort(byMonthThenPoints);
  }
}
```

- [ ] `vitest run src/features/members/repositories/participation-sort.test.ts` → PASS; `tsc --noEmit` clean.
- [ ] Commit `feat(backstage): member-points + participation read repositories`.

---

## Task 3: Hooks

**Files:**
- Modify `features/members/hooks/member-keys.ts`
- Create `features/members/hooks/use-member.ts`, `use-member-points.ts`, `use-member-participations.ts`

- [ ] `member-keys.ts`:

```ts
export const memberKeys = {
  all: ["members"] as const,
  detail: (id: string) => ["members", id] as const,
  points: (id: string, termId: string) => ["memberPoints", id, termId] as const,
  participations: (id: string, termId: string) => ["participations", id, termId] as const,
};
```

- [ ] `use-member.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { MemberRepository } from "../repositories/member-repository";
import { memberKeys } from "./member-keys";

export function useMember(id: string) {
  return useQuery({ queryKey: memberKeys.detail(id), queryFn: () => new MemberRepository().getById(id) });
}
```

- [ ] `use-member-points.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { MemberPointsRepository } from "../repositories/member-points-repository";
import { memberKeys } from "./member-keys";

export function useMemberPoints(memberId: string, termId: string) {
  return useQuery({
    queryKey: memberKeys.points(memberId, termId),
    queryFn: () => new MemberPointsRepository().getByMemberAndTerm(memberId, termId),
  });
}
```

- [ ] `use-member-participations.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { ParticipationRepository } from "../repositories/participation-repository";
import { memberKeys } from "./member-keys";

export function useMemberParticipations(memberId: string, termId: string) {
  return useQuery({
    queryKey: memberKeys.participations(memberId, termId),
    queryFn: () => new ParticipationRepository().getByMemberAndTerm(memberId, termId),
  });
}
```

- [ ] `tsc --noEmit` clean; commit `feat(backstage): member detail/points/participations hooks`.

---

## Task 4: `ParticipationLedger` component (TDD)

**Files:** create `features/members/components/participation-ledger.tsx` + `.test.tsx`.

Maps (module consts):
```ts
const ROLE_LABEL: Record<ParticipationRole, string> = {
  Director: "Director", CoDirector: "Codirector", Team: "Equipo", Attendee: "Asistente",
};
const STATE_LABEL: Record<ParticipationState, string> = {
  confirmed: "Confirmado", provisional: "Provisional", voided: "Anulado",
};
const STATE_TONE: Record<ParticipationState, BadgeTone> = {
  confirmed: "green", provisional: "gray", voided: "red",
};
```

- [ ] **Test** renders Fuente (`POINT_RULE_LABELS[code]`), Rol, Puntos, Estado badge, Mes; and an empty state when `rows=[]`. Assert e.g. label "Dirección de programa", "Confirmado", "Provisional".
- [ ] **Impl**: `@luminova/ui` `Table` with the five columns; `Badge tone={STATE_TONE[row.state]}`; `POINT_RULE_LABELS[row.pointRuleCode]`; empty → `EmptyState title="Sin participaciones registradas"`.
- [ ] `vitest run .../participation-ledger.test.tsx` → PASS; commit `feat(backstage): participation ledger table`.

---

## Task 5: Profile route `_app.members.$memberId.tsx`

**Files:** create `routes/_app.members.$memberId.tsx`.

- [ ] Implement: read `Route.useParams().memberId` + `currentTermId()`; `useMember`, `useMemberPoints`, `useMemberParticipations`. Layout per spec: back-link (`<Link to="/members">`), `PageHeader` eyebrow "Miembro" + member name, a stat showing `points?.cumulative ?? 0` "puntos · {termId}" + status `Badge`, a monthly breakdown (sorted `Object.entries(byMonth)` ascending as a labelled list; `Sparkline values={monthValues}` when ≥2 months), then `<ParticipationLedger rows={participations ?? []} />`. Loading → "Cargando…"; `member === null` → "Miembro no encontrado" + back-link.
- [ ] `pnpm --filter backstage exec vite build` to regenerate `routeTree.gen.ts`; then `pnpm --filter backstage build` clean.
- [ ] Commit `feat(backstage): member profile route` (+ routeTree.gen.ts).

---

## Task 6: Link the members table → profile

**Files:** modify `features/members/components/member-table.tsx` (+ test), `routes/_app.members.tsx`.

- [ ] Add an `onView: (member: Member) => void` prop to `MemberTable`; render a `RowAction icon={Icon.compass({ s: 17 })} label={\`Ver a ${member.name}\`} onClick={() => onView(member)}` as the first action, gated `<Can I="read" a="Member">`.
- [ ] In `_app.members.tsx`, `const navigate = useNavigate();` and pass `onView={(m) => navigate({ to: "/members/$memberId", params: { memberId: m.id } })}`.
- [ ] Update `member-table.test.tsx`: pass `onView={vi.fn()}`; add a case that clicking "Ver" calls `onView`.
- [ ] `vitest run` members tests → PASS; commit `feat(backstage): open member profile from the table`.

---

## Task 7: Verify

- [ ] `pnpm --filter backstage run ci` → PASS.
- [ ] `pnpm format && pnpm knip` → clean / exit 0.
- [ ] `pnpm pr-tests` (note the known emulator-port caveat).
- [ ] Update memory `project-luminova-v2.md` with the A5 entry.

No `/security-review` trigger (read-only; no rules/beacon/auth/repository-write change).

## Self-review
Spec coverage: route (T5), repos (T2), hooks (T3), ledger (T4), table link (T6), shared currentTermId (T1) — all present. Names consistent: `MemberPointsRepository.getByMemberAndTerm`, `ParticipationRepository.getByMemberAndTerm`, `byMonthThenPoints`, `useMember`/`useMemberPoints`/`useMemberParticipations`, `memberKeys.{detail,points,participations}`, `ParticipationLedger`. No placeholders.
