# Recognition Engine Data Model — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the Recognition Engine data model (Term, Program, Project, Activity, PointRule, Participation, MemberPoints + pure derivation helpers) into `@luminova/types`, with a beacon-safe `@luminova/types/engine` pure subpath.

**Architecture:** New `packages/types/src/engine/` directory. Persisted shapes use **type-only** `firebase` imports so emitted `.js` is self-contained. Pure framework-free helpers (point-rule resolver, punctuality factor, eligibility) ship now for A2 reuse. Zod schemas only for the two nearest write surfaces (PointRule → A1, Activity → D1 + invariant A); Term/Program/Project zod deferred to D1. A new `./engine` subpath exports **types + pure helpers only** (no zod). Root barrel re-exports everything (types + zod + helpers).

**Tech Stack:** TypeScript 6.0 (strict), zod 4.4.3, vitest 4, firebase 12.14.0 (type-only / devDependency).

**Scope note (YAGNI refinement of the spec):** the approved spec lists zod schemas for Activity/Program/Project. This plan ships zod for **PointRule + Activity** only (concrete invariants + nearest consumers A1/D1); Term/Program/Project ship as **types only**, their zod schemas land with their D1 forms. `Member.isPastPresident` is added **optional** (missing = `false`) so no backstage form/mapper churn.

---

## File structure

```
packages/types/src/
  engine/
    initiative.ts          # shared: InitiativeRoster, FinalReport, InitiativeStatus
    term.ts                # Term, BoardSeat, TermStatus
    program.ts             # Program
    project.ts             # Project
    activity.ts            # Activity, ActivityCategory, ActivityOrganizers, ActivityStatus
    point-rule.ts          # PointRule, PointRuleCode, DEFAULT_POINT_VALUES
    participation.ts       # Participation, ParticipationRole, ParticipationState, ParticipationGates
    member-points.ts       # MemberPoints
    resolve-point-rule.ts  # pure: (role, parentType, category) -> PointRuleCode | null
    resolve-point-rule.test.ts
    compute-punctuality.ts # pure: (role, checkInAt, startAt) -> 1 | 0.5
    compute-punctuality.test.ts
    eligibility.ts         # pure: isExecutiveCommittee / wonBestMemberPreviousTerm / isPastPresident / evaluateEligibility
    eligibility.test.ts
    point-rule-schema.ts   # zod (A1 edit surface)
    point-rule-schema.test.ts
    activity-schema.ts     # zod + superRefine invariant A (D1 surface)
    activity-schema.test.ts
    index.ts               # engine barrel: TYPES + pure helpers only (no zod)
  member.ts                # +isPastPresident?: boolean
  member-schema.ts         # +isPastPresident optional
  index.ts                 # root barrel: re-export engine types + zod + helpers
packages/types/package.json # +"./engine" export
docs/data-models.md         # +Recognition Engine section
```

---

## Task 1: Engine type files (model skeleton)

Pure type files — validated by `tsc`, no runtime tests. `Timestamp` is **type-only** imported.

**Files:**
- Create: `packages/types/src/engine/initiative.ts`
- Create: `packages/types/src/engine/term.ts`
- Create: `packages/types/src/engine/program.ts`
- Create: `packages/types/src/engine/project.ts`
- Create: `packages/types/src/engine/activity.ts`
- Create: `packages/types/src/engine/point-rule.ts`
- Create: `packages/types/src/engine/participation.ts`
- Create: `packages/types/src/engine/member-points.ts`

- [ ] **Step 1: Write `initiative.ts` (shared Program/Project pieces)**

```ts
import type { Timestamp } from "firebase/firestore";

export const INITIATIVE_STATUSES = ["Planificacion", "EnEjecucion", "Finalizado"] as const;
export type InitiativeStatus = (typeof INITIATIVE_STATUSES)[number];

export interface InitiativeRoster {
  directorId: string;
  coDirectorId: string | null;
  teamIds: string[];
}

/** Director's final report — the confirmation gate for all child-activity points. */
export interface FinalReport {
  filedAt: Timestamp;
  filedBy: string;
}
```

- [ ] **Step 2: Write `term.ts`**

```ts
import type { Timestamp } from "firebase/firestore";

export const TERM_STATUSES = ["Activo", "Cerrado"] as const;
export type TermStatus = (typeof TERM_STATUSES)[number];

/** A board seat: a chapter title (Spanish) — NOT a permission role. */
export interface BoardSeat {
  memberId: string;
  title: string;
  isExecutiveCommittee: boolean;
}

/** Annual cycle (gestión). `year` is first-class so saved data is self-describing. */
export interface Term {
  id: string;
  year: number;
  label?: string;
  board: BoardSeat[];
  conventionDate: Timestamp;
  pointsCutoffAt: Timestamp;
  bestMemberId: string | null;
  status: TermStatus;
}
```

- [ ] **Step 3: Write `program.ts`**

```ts
import type { FinalReport, InitiativeRoster, InitiativeStatus } from "./initiative";

/** Program — distinct from Project (different core + distinct point codes). Engine-minimal; C1 extends. */
export interface Program {
  id: string;
  termId: string;
  title: string;
  roster: InitiativeRoster;
  finalReport: FinalReport | null;
  status: InitiativeStatus;
}
```

- [ ] **Step 4: Write `project.ts`**

```ts
import type { FinalReport, InitiativeRoster, InitiativeStatus } from "./initiative";

/** Project — distinct from Program. Engine-minimal; the rich dossier model is C1. */
export interface Project {
  id: string;
  termId: string;
  title: string;
  roster: InitiativeRoster;
  finalReport: FinalReport | null;
  status: InitiativeStatus;
}
```

- [ ] **Step 5: Write `activity.ts`**

```ts
import type { Timestamp } from "firebase/firestore";

export const ACTIVITY_CATEGORIES = [
  "Assembly",
  "Course",
  "Anniversary",
  "TM",
  "NationalEvent",
  "ProjectExecution",
] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

export const ACTIVITY_STATUSES = ["Programada", "Ejecutada", "Cancelada"] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export type InitiativeKind = "Program" | "Project";

/** Activity-level direction (may differ from the parent initiative roster). */
export interface ActivityOrganizers {
  directorId: string | null;
  coDirectorId: string | null;
}

/**
 * The attendable unit. Institutional categories have `parentId === null`;
 * `ProjectExecution` is tied to a parent Program/Project (Invariant A).
 */
export interface Activity {
  id: string;
  termId: string;
  category: ActivityCategory;
  parentType: InitiativeKind | null;
  parentId: string | null;
  organizers: ActivityOrganizers;
  startAt: Timestamp;
  status: ActivityStatus;
}
```

- [ ] **Step 6: Write `point-rule.ts`**

```ts
export const POINT_RULE_CODES = [
  "DirectProgram",
  "CoDirectProgram",
  "DirectProject",
  "CoDirectProject",
  "DirectActivity",
  "CoDirectActivity",
  "ProgramProjectTeam",
  "AttendAssembly",
  "AttendCourse",
  "AttendActivity",
  "AttendNationalEvent",
  "AttendAnniversary",
  "AttendTM",
  "HeadTrainer",
  "AssistantTrainer",
  "PaymentPlanAdhesion",
] as const;
export type PointRuleCode = (typeof POINT_RULE_CODES)[number];

/** Matrix baseline point values (admin can edit per term). */
export const DEFAULT_POINT_VALUES: Record<PointRuleCode, number> = {
  DirectProgram: 10,
  CoDirectProgram: 8,
  DirectProject: 8,
  CoDirectProject: 6,
  DirectActivity: 5,
  CoDirectActivity: 3,
  ProgramProjectTeam: 4,
  AttendAssembly: 4,
  AttendCourse: 3,
  AttendActivity: 3,
  AttendNationalEvent: 5,
  AttendAnniversary: 5,
  AttendTM: 6,
  HeadTrainer: 7,
  AssistantTrainer: 5,
  PaymentPlanAdhesion: 5,
};

/** A term-scoped editable point value for one matrix row. */
export interface PointRule {
  id: string;
  termId: string;
  code: PointRuleCode;
  points: number;
  label: string;
}
```

- [ ] **Step 7: Write `participation.ts`**

```ts
import type { Timestamp } from "firebase/firestore";
import type { PointRuleCode } from "./point-rule";

export const PARTICIPATION_ROLES = ["Director", "CoDirector", "Team", "Attendee"] as const;
export type ParticipationRole = (typeof PARTICIPATION_ROLES)[number];

export const PARTICIPATION_STATES = ["provisional", "confirmed", "voided"] as const;
export type ParticipationState = (typeof PARTICIPATION_STATES)[number];

export interface ParticipationGates {
  attendanceRegistered: boolean;
  /** Only meaningful when the activity has a parent Program/Project. */
  finalReportFiled: boolean;
}

/** Ledger row — written by the engine (A2) only; client read-only. */
export interface Participation {
  id: string;
  memberId: string;
  termId: string;
  activityId: string;
  role: ParticipationRole;
  pointRuleCode: PointRuleCode;
  basePoints: number;
  punctualityFactor: 1 | 0.5;
  computedPoints: number;
  monthBucket: string;
  state: ParticipationState;
  gates: ParticipationGates;
  checkInAt: Timestamp | null;
  voidReason: string | null;
  createdAt: Timestamp;
}
```

- [ ] **Step 8: Write `member-points.ts`**

```ts
import type { Timestamp } from "firebase/firestore";

/** Derived aggregate (id === memberId). Engine-written; `Member.totalPoints` mirrors `cumulative`. */
export interface MemberPoints {
  id: string;
  termId: string;
  cumulative: number;
  byMonth: Record<string, number>;
  updatedAt: Timestamp;
}
```

- [ ] **Step 9: Typecheck**

Run: `pnpm --filter @luminova/types exec tsc --noEmit`
Expected: PASS (no errors; files compile in isolation).

- [ ] **Step 10: Commit**

```bash
git add packages/types/src/engine/
git commit -m "feat(types): F3 recognition engine entity types"
```

---

## Task 2: Point-rule resolver (pure helper, TDD)

Resolves the matrix row code from a participation's `(role, parentType, category)`. Trainer/payment-plan codes are explicit (not category-derived) → resolver returns `null` for `Attendee` on those (they are not category attendance) and the caller awards them directly.

**Files:**
- Create: `packages/types/src/engine/resolve-point-rule.ts`
- Test: `packages/types/src/engine/resolve-point-rule.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { resolvePointRuleCode } from "./resolve-point-rule";

describe("resolvePointRuleCode", () => {
  it("maps director of a program/project/activity", () => {
    expect(resolvePointRuleCode({ role: "Director", parentType: "Program", category: "ProjectExecution" })).toBe("DirectProgram");
    expect(resolvePointRuleCode({ role: "Director", parentType: "Project", category: "ProjectExecution" })).toBe("DirectProject");
    expect(resolvePointRuleCode({ role: "Director", parentType: null, category: "Assembly" })).toBe("DirectActivity");
  });

  it("maps co-director", () => {
    expect(resolvePointRuleCode({ role: "CoDirector", parentType: "Program", category: "ProjectExecution" })).toBe("CoDirectProgram");
    expect(resolvePointRuleCode({ role: "CoDirector", parentType: "Project", category: "ProjectExecution" })).toBe("CoDirectProject");
    expect(resolvePointRuleCode({ role: "CoDirector", parentType: null, category: "TM" })).toBe("CoDirectActivity");
  });

  it("maps team only for a parented initiative", () => {
    expect(resolvePointRuleCode({ role: "Team", parentType: "Program", category: "ProjectExecution" })).toBe("ProgramProjectTeam");
    expect(resolvePointRuleCode({ role: "Team", parentType: "Project", category: "ProjectExecution" })).toBe("ProgramProjectTeam");
    expect(resolvePointRuleCode({ role: "Team", parentType: null, category: "Assembly" })).toBeNull();
  });

  it("maps attendee by activity category", () => {
    expect(resolvePointRuleCode({ role: "Attendee", parentType: null, category: "Assembly" })).toBe("AttendAssembly");
    expect(resolvePointRuleCode({ role: "Attendee", parentType: null, category: "Course" })).toBe("AttendCourse");
    expect(resolvePointRuleCode({ role: "Attendee", parentType: "Project", category: "ProjectExecution" })).toBe("AttendActivity");
    expect(resolvePointRuleCode({ role: "Attendee", parentType: null, category: "NationalEvent" })).toBe("AttendNationalEvent");
    expect(resolvePointRuleCode({ role: "Attendee", parentType: null, category: "Anniversary" })).toBe("AttendAnniversary");
    expect(resolvePointRuleCode({ role: "Attendee", parentType: null, category: "TM" })).toBe("AttendTM");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @luminova/types exec vitest run src/engine/resolve-point-rule.test.ts`
Expected: FAIL — `resolvePointRuleCode` is not defined.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { ActivityCategory, InitiativeKind } from "./activity";
import type { ParticipationRole } from "./participation";
import type { PointRuleCode } from "./point-rule";

export interface ResolvePointRuleInput {
  role: ParticipationRole;
  parentType: InitiativeKind | null;
  category: ActivityCategory;
}

const ATTEND_BY_CATEGORY: Record<ActivityCategory, PointRuleCode> = {
  Assembly: "AttendAssembly",
  Course: "AttendCourse",
  ProjectExecution: "AttendActivity",
  NationalEvent: "AttendNationalEvent",
  Anniversary: "AttendAnniversary",
  TM: "AttendTM",
};

/**
 * Resolve the matrix code for a category/role-derived participation.
 * Returns `null` when no category rule applies (e.g. Team on an institutional
 * activity). HeadTrainer/AssistantTrainer/PaymentPlanAdhesion are awarded
 * explicitly by the caller, not through this resolver.
 */
export function resolvePointRuleCode({ role, parentType, category }: ResolvePointRuleInput): PointRuleCode | null {
  switch (role) {
    case "Director":
      if (parentType === "Program") return "DirectProgram";
      if (parentType === "Project") return "DirectProject";
      return "DirectActivity";
    case "CoDirector":
      if (parentType === "Program") return "CoDirectProgram";
      if (parentType === "Project") return "CoDirectProject";
      return "CoDirectActivity";
    case "Team":
      return parentType === null ? null : "ProgramProjectTeam";
    case "Attendee":
      return ATTEND_BY_CATEGORY[category];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @luminova/types exec vitest run src/engine/resolve-point-rule.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/engine/resolve-point-rule.ts packages/types/src/engine/resolve-point-rule.test.ts
git commit -m "feat(types): point-rule code resolver"
```

---

## Task 3: Punctuality factor (pure helper, TDD)

Applies only to `Attendee` rows: `checkInAt ≤ startAt + 15min → 1.0`, later → `0.5`. Non-attendee roles are flat `1.0`. A missing `checkInAt` for an attendee means unregistered → `0.5` (no integral credit).

**Files:**
- Create: `packages/types/src/engine/compute-punctuality.ts`
- Test: `packages/types/src/engine/compute-punctuality.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase/firestore";
import { computePunctualityFactor } from "./compute-punctuality";

const start = Timestamp.fromDate(new Date("2026-06-06T18:00:00Z"));
const within = Timestamp.fromDate(new Date("2026-06-06T18:14:00Z"));
const late = Timestamp.fromDate(new Date("2026-06-06T18:16:00Z"));
const exactly15 = Timestamp.fromDate(new Date("2026-06-06T18:15:00Z"));

describe("computePunctualityFactor", () => {
  it("is 1.0 for non-attendee roles regardless of timing", () => {
    expect(computePunctualityFactor({ role: "Director", checkInAt: late, startAt: start })).toBe(1);
    expect(computePunctualityFactor({ role: "Team", checkInAt: null, startAt: start })).toBe(1);
  });

  it("is 1.0 for an attendee within the 15-minute tolerance (inclusive)", () => {
    expect(computePunctualityFactor({ role: "Attendee", checkInAt: within, startAt: start })).toBe(1);
    expect(computePunctualityFactor({ role: "Attendee", checkInAt: exactly15, startAt: start })).toBe(1);
  });

  it("is 0.5 for an attendee past the tolerance", () => {
    expect(computePunctualityFactor({ role: "Attendee", checkInAt: late, startAt: start })).toBe(0.5);
  });

  it("is 0.5 for an attendee with no check-in", () => {
    expect(computePunctualityFactor({ role: "Attendee", checkInAt: null, startAt: start })).toBe(0.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @luminova/types exec vitest run src/engine/compute-punctuality.test.ts`
Expected: FAIL — `computePunctualityFactor` is not defined.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { Timestamp } from "firebase/firestore";
import type { ParticipationRole } from "./participation";

export interface ComputePunctualityInput {
  role: ParticipationRole;
  checkInAt: Timestamp | null;
  startAt: Timestamp;
}

const TOLERANCE_MS = 15 * 60 * 1000;

/** Punctuality factor for a participation row. Only `Attendee` rows are reduced. */
export function computePunctualityFactor({ role, checkInAt, startAt }: ComputePunctualityInput): 1 | 0.5 {
  if (role !== "Attendee") return 1;
  if (checkInAt === null) return 0.5;
  return checkInAt.toMillis() <= startAt.toMillis() + TOLERANCE_MS ? 1 : 0.5;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @luminova/types exec vitest run src/engine/compute-punctuality.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/engine/compute-punctuality.ts packages/types/src/engine/compute-punctuality.test.ts
git commit -m "feat(types): punctuality factor helper"
```

---

## Task 4: Eligibility helpers (pure, TDD)

Derives the three signals + a combined verdict. `canAccrue` = not a past-president. `canCompete` = accrues AND not CEL AND not previous-term winner.

**Files:**
- Create: `packages/types/src/engine/eligibility.ts`
- Test: `packages/types/src/engine/eligibility.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase/firestore";
import {
  isExecutiveCommittee,
  wonBestMemberPreviousTerm,
  evaluateEligibility,
} from "./eligibility";
import type { Term } from "./term";

const ts = Timestamp.fromDate(new Date("2026-10-01T00:00:00Z"));

function term(overrides: Partial<Term> = {}): Term {
  return {
    id: "t2026",
    year: 2026,
    board: [
      { memberId: "cel-1", title: "Presidenta", isExecutiveCommittee: true },
      { memberId: "dir-1", title: "Director de Proyectos", isExecutiveCommittee: false },
    ],
    conventionDate: ts,
    pointsCutoffAt: ts,
    bestMemberId: null,
    status: "Activo",
    ...overrides,
  };
}

describe("isExecutiveCommittee", () => {
  it("is true for a member on the board with the CEL flag", () => {
    expect(isExecutiveCommittee("cel-1", term())).toBe(true);
  });
  it("is false for a non-CEL board member and for non-members", () => {
    expect(isExecutiveCommittee("dir-1", term())).toBe(false);
    expect(isExecutiveCommittee("ghost", term())).toBe(false);
  });
});

describe("wonBestMemberPreviousTerm", () => {
  it("is true when the previous term's winner is this member", () => {
    expect(wonBestMemberPreviousTerm("m-1", term({ bestMemberId: "m-1" }))).toBe(true);
  });
  it("is false otherwise and when there is no previous term", () => {
    expect(wonBestMemberPreviousTerm("m-1", term({ bestMemberId: "m-2" }))).toBe(false);
    expect(wonBestMemberPreviousTerm("m-1", null)).toBe(false);
  });
});

describe("evaluateEligibility", () => {
  it("blocks accrual for past presidents", () => {
    const result = evaluateEligibility({
      memberId: "dir-1",
      isPastPresident: true,
      currentTerm: term(),
      previousTerm: null,
    });
    expect(result.canAccrue).toBe(false);
    expect(result.canCompete).toBe(false);
    expect(result.reasons).toContain("PastPresident");
  });

  it("lets a CEL member accrue but not compete", () => {
    const result = evaluateEligibility({
      memberId: "cel-1",
      isPastPresident: false,
      currentTerm: term(),
      previousTerm: null,
    });
    expect(result.canAccrue).toBe(true);
    expect(result.canCompete).toBe(false);
    expect(result.reasons).toContain("ExecutiveCommittee");
  });

  it("excludes the previous winner from competition", () => {
    const result = evaluateEligibility({
      memberId: "dir-1",
      isPastPresident: false,
      currentTerm: term(),
      previousTerm: term({ id: "t2025", year: 2025, bestMemberId: "dir-1" }),
    });
    expect(result.canCompete).toBe(false);
    expect(result.reasons).toContain("WonPreviousTerm");
  });

  it("lets an ordinary director accrue and compete", () => {
    const result = evaluateEligibility({
      memberId: "dir-1",
      isPastPresident: false,
      currentTerm: term(),
      previousTerm: term({ id: "t2025", year: 2025, bestMemberId: "someone-else" }),
    });
    expect(result.canAccrue).toBe(true);
    expect(result.canCompete).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @luminova/types exec vitest run src/engine/eligibility.test.ts`
Expected: FAIL — helpers not defined.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { Term } from "./term";

export function isExecutiveCommittee(memberId: string, term: Term): boolean {
  return term.board.some((seat) => seat.memberId === memberId && seat.isExecutiveCommittee);
}

export function wonBestMemberPreviousTerm(memberId: string, previousTerm: Term | null): boolean {
  return previousTerm?.bestMemberId === memberId && memberId.length > 0;
}

export type IneligibilityReason = "PastPresident" | "ExecutiveCommittee" | "WonPreviousTerm";

export interface EvaluateEligibilityInput {
  memberId: string;
  isPastPresident: boolean;
  currentTerm: Term;
  previousTerm: Term | null;
}

export interface EligibilityResult {
  canAccrue: boolean;
  canCompete: boolean;
  reasons: IneligibilityReason[];
}

/**
 * Accrual vs competition (matrix "Parámetros Generales"):
 * - past presidents do NOT accrue;
 * - CEL members and the previous winner accrue but are excluded from the leaderboard.
 */
export function evaluateEligibility({
  memberId,
  isPastPresident,
  currentTerm,
  previousTerm,
}: EvaluateEligibilityInput): EligibilityResult {
  const reasons: IneligibilityReason[] = [];
  if (isPastPresident) reasons.push("PastPresident");
  if (isExecutiveCommittee(memberId, currentTerm)) reasons.push("ExecutiveCommittee");
  if (wonBestMemberPreviousTerm(memberId, previousTerm)) reasons.push("WonPreviousTerm");

  const canAccrue = !isPastPresident;
  const canCompete = canAccrue && reasons.length === 0;
  return { canAccrue, canCompete, reasons };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @luminova/types exec vitest run src/engine/eligibility.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/engine/eligibility.ts packages/types/src/engine/eligibility.test.ts
git commit -m "feat(types): eligibility derivation helpers"
```

---

## Task 5: PointRule zod schema (A1 edit surface, TDD)

Validates an admin edit of a point value (code from the fixed enum, points a non-negative integer).

**Files:**
- Create: `packages/types/src/engine/point-rule-schema.ts`
- Test: `packages/types/src/engine/point-rule-schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { pointRuleSchema } from "./point-rule-schema";

describe("pointRuleSchema", () => {
  it("accepts a valid code + non-negative integer points", () => {
    const parsed = pointRuleSchema.parse({ code: "DirectProgram", points: 10, label: "Dirección de programa" });
    expect(parsed.points).toBe(10);
  });

  it("rejects an unknown code", () => {
    expect(pointRuleSchema.safeParse({ code: "Nope", points: 1, label: "x" }).success).toBe(false);
  });

  it("rejects negative or non-integer points", () => {
    expect(pointRuleSchema.safeParse({ code: "DirectProgram", points: -1, label: "x" }).success).toBe(false);
    expect(pointRuleSchema.safeParse({ code: "DirectProgram", points: 1.5, label: "x" }).success).toBe(false);
  });

  it("requires a non-empty label", () => {
    expect(pointRuleSchema.safeParse({ code: "DirectProgram", points: 1, label: "" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @luminova/types exec vitest run src/engine/point-rule-schema.test.ts`
Expected: FAIL — `pointRuleSchema` not defined.

- [ ] **Step 3: Write minimal implementation**

```ts
import { z } from "zod";
import { POINT_RULE_CODES } from "./point-rule";

export const pointRuleSchema = z.object({
  code: z.enum(POINT_RULE_CODES),
  points: z.number().int("Debe ser un entero.").min(0, "No puede ser negativo."),
  label: z.string().min(1, "Requerido."),
});

export type PointRuleInput = z.infer<typeof pointRuleSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @luminova/types exec vitest run src/engine/point-rule-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/engine/point-rule-schema.ts packages/types/src/engine/point-rule-schema.test.ts
git commit -m "feat(types): point-rule zod schema"
```

---

## Task 6: Activity zod schema + Invariant A (D1 surface, TDD)

Encodes **Invariant A**: `category === 'ProjectExecution'` ⟺ `parentId` present; institutional categories ⟺ no parent.

**Files:**
- Create: `packages/types/src/engine/activity-schema.ts`
- Test: `packages/types/src/engine/activity-schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { activitySchema } from "./activity-schema";

const base = {
  category: "ProjectExecution" as const,
  parentType: "Project" as const,
  parentId: "p-1",
  startAt: "2026-06-06T18:00",
  directorId: "m-1",
};

describe("activitySchema", () => {
  it("accepts a ProjectExecution with a parent", () => {
    expect(activitySchema.safeParse(base).success).toBe(true);
  });

  it("accepts an institutional activity with no parent", () => {
    expect(
      activitySchema.safeParse({
        category: "Assembly",
        parentType: null,
        parentId: null,
        startAt: "2026-06-06T18:00",
        directorId: null,
      }).success,
    ).toBe(true);
  });

  it("rejects a ProjectExecution without a parent (Invariant A)", () => {
    expect(activitySchema.safeParse({ ...base, parentType: null, parentId: null }).success).toBe(false);
  });

  it("rejects an institutional category that carries a parent (Invariant A)", () => {
    expect(
      activitySchema.safeParse({
        category: "Assembly",
        parentType: "Program",
        parentId: "x",
        startAt: "2026-06-06T18:00",
        directorId: null,
      }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @luminova/types exec vitest run src/engine/activity-schema.test.ts`
Expected: FAIL — `activitySchema` not defined.

- [ ] **Step 3: Write minimal implementation**

```ts
import { z } from "zod";
import { ACTIVITY_CATEGORIES } from "./activity";

export const activitySchema = z
  .object({
    category: z.enum(ACTIVITY_CATEGORIES),
    parentType: z.enum(["Program", "Project"]).nullable(),
    parentId: z.string().min(1).nullable(),
    startAt: z.string().min(1, "Requerido."),
    directorId: z.string().min(1).nullable(),
  })
  .superRefine((value, ctx) => {
    const isExecution = value.category === "ProjectExecution";
    const hasParent = value.parentType !== null && value.parentId !== null;
    if (isExecution && !hasParent) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Una ejecución requiere un programa o proyecto padre.", path: ["parentId"] });
    }
    if (!isExecution && hasParent) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Una actividad institucional no lleva padre.", path: ["parentId"] });
    }
  });

export type ActivityInput = z.infer<typeof activitySchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @luminova/types exec vitest run src/engine/activity-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/engine/activity-schema.ts packages/types/src/engine/activity-schema.test.ts
git commit -m "feat(types): activity zod schema with parent invariant"
```

---

## Task 7: Add `isPastPresident` to Member (optional, TDD)

Optional field (missing = `false`) so existing forms/mapper/seeded docs are unaffected.

**Files:**
- Modify: `packages/types/src/member.ts`
- Modify: `packages/types/src/member-schema.ts`
- Modify: `packages/types/src/member-schema.test.ts`

- [ ] **Step 1: Add a failing test to `member-schema.test.ts`**

Append this `describe` block:

```ts
describe("memberSchema isPastPresident", () => {
  it("accepts an explicit boolean", () => {
    const parsed = memberSchema.parse({
      name: "Ana Pérez",
      email: "ana@jci.bo",
      role: "Presidenta",
      joinDate: "2020-03-15",
      birthdate: "1992-07-01",
      status: "Activo",
      isPastPresident: true,
    });
    expect(parsed.isPastPresident).toBe(true);
  });

  it("is optional (omitted parses fine)", () => {
    const parsed = memberSchema.parse({
      name: "Ana Pérez",
      email: "ana@jci.bo",
      role: "Presidenta",
      joinDate: "2020-03-15",
      birthdate: "1992-07-01",
      status: "Activo",
    });
    expect(parsed.isPastPresident).toBeUndefined();
  });
});
```

Confirm the existing test file imports `memberSchema` and `describe/it/expect` (it does).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @luminova/types exec vitest run src/member-schema.test.ts`
Expected: FAIL — `isPastPresident` not in schema output (first new test fails).

- [ ] **Step 3: Add the field to `member.ts`**

Add to the `Member` interface (after `active`/`deletedAt` block, keep alphabeticalish grouping with other flags):

```ts
  /** Past-president flag → eligibility (cannot accrue Mejor Miembro points). Missing = false. */
  isPastPresident?: boolean;
```

- [ ] **Step 4: Add the field to `member-schema.ts`**

Add to the `memberSchema` object (after `status`):

```ts
  isPastPresident: z.boolean().optional(),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @luminova/types exec vitest run src/member-schema.test.ts`
Expected: PASS (existing + 2 new).

- [ ] **Step 6: Commit**

```bash
git add packages/types/src/member.ts packages/types/src/member-schema.ts packages/types/src/member-schema.test.ts
git commit -m "feat(types): add optional isPastPresident to Member for eligibility"
```

---

## Task 8: Wire engine barrel, root barrel, and `./engine` subpath export

**Files:**
- Create: `packages/types/src/engine/index.ts`
- Modify: `packages/types/src/index.ts`
- Modify: `packages/types/package.json`

- [ ] **Step 1: Write `engine/index.ts` (types + pure helpers only — NO zod)**

```ts
export type { InitiativeRoster, FinalReport, InitiativeStatus } from "./initiative";
export { INITIATIVE_STATUSES } from "./initiative";
export type { Term, BoardSeat, TermStatus } from "./term";
export { TERM_STATUSES } from "./term";
export type { Program } from "./program";
export type { Project } from "./project";
export type { Activity, ActivityCategory, ActivityOrganizers, ActivityStatus, InitiativeKind } from "./activity";
export { ACTIVITY_CATEGORIES, ACTIVITY_STATUSES } from "./activity";
export type { PointRule, PointRuleCode } from "./point-rule";
export { POINT_RULE_CODES, DEFAULT_POINT_VALUES } from "./point-rule";
export type { Participation, ParticipationRole, ParticipationState, ParticipationGates } from "./participation";
export { PARTICIPATION_ROLES, PARTICIPATION_STATES } from "./participation";
export type { MemberPoints } from "./member-points";
export { resolvePointRuleCode, type ResolvePointRuleInput } from "./resolve-point-rule";
export { computePunctualityFactor, type ComputePunctualityInput } from "./compute-punctuality";
export {
  isExecutiveCommittee,
  wonBestMemberPreviousTerm,
  evaluateEligibility,
  type IneligibilityReason,
  type EvaluateEligibilityInput,
  type EligibilityResult,
} from "./eligibility";
```

- [ ] **Step 2: Extend the root barrel `src/index.ts`**

Append after the existing member/ally exports:

```ts
export * from "./engine";
export { pointRuleSchema, type PointRuleInput } from "./engine/point-rule-schema";
export { activitySchema, type ActivityInput } from "./engine/activity-schema";
```

- [ ] **Step 3: Add the `./engine` export to `package.json`**

Replace the `"exports"` block with:

```jsonc
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    },
    "./engine": {
      "types": "./src/engine/index.ts",
      "import": "./dist/engine/index.js",
      "default": "./dist/engine/index.js"
    }
  },
```

- [ ] **Step 4: Build and verify the subpath emits self-contained JS**

Run: `pnpm --filter @luminova/types build && node -e "import('@luminova/types/engine').then(m => console.log(Object.keys(m)))"`
Expected: build succeeds; the printed keys include `resolvePointRuleCode`, `computePunctualityFactor`, `evaluateEligibility`, `DEFAULT_POINT_VALUES`, `ACTIVITY_CATEGORIES` (proves `dist/engine/index.js` has no unresolved firebase import — type-only erased).

- [ ] **Step 5: Verify the engine subpath is zod-free (beacon-safe)**

Run: `grep -rn "zod" packages/types/dist/engine/ || echo "OK: no zod in engine dist"`
Expected: `OK: no zod in engine dist`.

- [ ] **Step 6: Commit**

```bash
git add packages/types/src/engine/index.ts packages/types/src/index.ts packages/types/package.json
git commit -m "feat(types): wire engine barrel + ./engine pure subpath export"
```

---

## Task 9: Document the model in `docs/data-models.md`

**Files:**
- Modify: `docs/data-models.md`

- [ ] **Step 1: Append a Recognition Engine section**

Add a `## Recognition Engine (F3)` section documenting each collection
(`terms`, `programs`, `projects`, `activities`, `pointRules`, `participations`,
`memberPoints`) with its fields, the six derivation rules, Invariant A, the
Finance→Points read coupling, and the firestore.rules implications table. Mirror
the wording in `docs/superpowers/specs/2026-06-06-recognition-engine-model-design.md`
(§Entities, §Derivation rules & invariants, §firestore.rules implications). Note
that `participations`/`memberPoints` are engine-written (client read-only) and
that rules edits land with A1/A2/D1.

- [ ] **Step 2: Commit**

```bash
git add docs/data-models.md
git commit -m "docs(data-models): document recognition engine collections"
```

---

## Task 10: Full verification

- [ ] **Step 1: Package CI**

Run: `pnpm --filter @luminova/types run ci`
Expected: eslint + tsc + vitest all PASS.

- [ ] **Step 2: Repo-wide PR tests (confirms backstage/beacon unaffected by the Member change)**

Run: `pnpm pr-tests`
Expected: format + all-package CI + knip PASS. (If knip flags a newly-unused engine export, that export has no consumer yet — confirm it is intentionally part of the public API surface; engine exports are the F3 contract for A1/A2/D1, so add to knip's entry coverage if needed, do NOT delete.)

- [ ] **Step 3: Update the memory file**

Update `project-luminova-v2.md` with an F3-done entry (entities shipped, `./engine` subpath, deferred items: rules edits, Term/Program/Project zod, I1 gate, social tiebreaker).

---

## Self-review

**Spec coverage:** Term (T1) ✓ with `year`; Program/Project distinct (T1) ✓; unified Activity + category + Invariant A (T1, T6) ✓; PointRule fixed enum + editable points (T1, T5) ✓; Participation ledger w/ state/gates/punctuality/monthBucket/voided (T1) ✓; MemberPoints aggregate (T1) ✓; resolver (T2) ✓; punctuality (T3) ✓; eligibility hybrid (T4) ✓; `Member.isPastPresident` (T7) ✓; `./engine` pure subpath (T8) ✓; data-models doc (T9) ✓; rules documented-only (T9, no rules edit) ✓; deferred items called out (scope note) ✓.

**Placeholder scan:** Task 9 Step 1 is prose-directed (a doc-writing task mirroring the committed spec), not a code placeholder — acceptable. All code steps contain full code.

**Type consistency:** `resolvePointRuleCode`/`ResolvePointRuleInput`, `computePunctualityFactor`/`ComputePunctualityInput`, `evaluateEligibility`/`EligibilityResult`, `InitiativeKind`, `ActivityCategory`, `ParticipationRole`, `PointRuleCode` names match across Tasks 1–8. `parentType` typed `InitiativeKind | null` consistently in `activity.ts` and `resolve-point-rule.ts`. Member field `isPastPresident` consistent across member.ts/schema/eligibility input.
</content>
