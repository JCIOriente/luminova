# Initiative Schema (C1-lite slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `Program`/`Project`/`Activity` to the rich C1-lite shape (multi-co-director rosters, description/category/dates, impact, photos), update the beacon engine + rules + seed, and keep backstage compile-green — per `docs/specs/2026-06-10-initiatives-c1-lite-design.md`.

**Architecture:** Shared `InitiativeCore` in `@luminova/types/engine`; beacon A7 reconciler expands `coDirectorIds[]` and mirrors a beacon-maintained `directionUids` denormalization onto each initiative doc so `firestore.rules` can grant the direction (director + co-directors) update rights without array `get()` loops. No data migration — wipe + reseed.

**Tech Stack:** TypeScript strict, zod, vitest, firebase-admin (beacon), `@firebase/rules-unit-testing` (emulator on port 4010), React Hook Form (backstage forms).

**Worktree/branch:** work in `.worktrees/initiatives-c1`; create `feat/initiative-schema` off `chore/initiatives-c1-spec` (stacked — the spec docs PR merges first).

**Engine truths discovered during planning (do not re-derive):**
- The engine never reads `activities.organizers` — direction participations come only from the initiative roster (`processInitiativeWrite`) and from check-in facts. Decision 9 ("parented-activity organizers award nothing") already holds; Task 4 adds a regression test, no behavior change.
- Backstage repositories spread doc data (`{ id, ...d.data() }`), so new fields flow through with no repository changes — only mappers and forms change.
- `parseInitiativeWrite` (beacon) drops non-path-safe member ids (`isCleanId`) — keep that for `coDirectorIds`.
- The completion wizard is slice 5; this slice only ships the types/schemas (`InitiativeImpact`) and the rules lock so completed docs are immutable.

**Known limitation (document, don't fix here):** `directionUids` refreshes on initiative writes. If a member gets their login (`uid`) provisioned *after* being put on a roster, re-save the initiative to refresh `directionUids`. Acceptable v1; revisit if it bites.

---

### Task 0: Branch

- [ ] **Step 0.1: Create the slice branch**

```bash
cd /Users/arnoldgandarillas/Projects/Veloud/luminova/.worktrees/initiatives-c1
git checkout -b feat/initiative-schema
```

---

### Task 1: Multi-co-director roster (types + zod)

**Files:**
- Modify: `packages/types/src/engine/initiative.ts`
- Modify: `packages/types/src/engine/initiative-schema.ts`
- Test: `packages/types/src/engine/initiative-schema.test.ts`

- [ ] **Step 1.1: Update the roster tests to the new shape (failing)**

In `initiative-schema.test.ts`, replace every `coDirectorId: <x>` in roster fixtures with `coDirectorIds: []` (or `["m2"]` where a co-director is the point of the test), and add:

```ts
it("rejects the director among the co-directors", () => {
  const r = initiativeRosterSchema.safeParse({
    directorId: "m1",
    coDirectorIds: ["m1"],
    teamIds: [],
  });
  expect(r.success).toBe(false);
});

it("rejects duplicate co-directors", () => {
  const r = initiativeRosterSchema.safeParse({
    directorId: "m1",
    coDirectorIds: ["m2", "m2"],
    teamIds: [],
  });
  expect(r.success).toBe(false);
});

it("rejects a co-director who is also on the team", () => {
  const r = initiativeRosterSchema.safeParse({
    directorId: "m1",
    coDirectorIds: ["m2"],
    teamIds: ["m2"],
  });
  expect(r.success).toBe(false);
});

it("accepts multiple distinct co-directors", () => {
  const r = initiativeRosterSchema.safeParse({
    directorId: "m1",
    coDirectorIds: ["m2", "m3"],
    teamIds: ["m4"],
  });
  expect(r.success).toBe(true);
});
```

- [ ] **Step 1.2: Run to verify failure**

Run: `pnpm --filter @luminova/types run test`
Expected: FAIL (schema still expects `coDirectorId`).

- [ ] **Step 1.3: Update `initiative.ts` roster type**

```ts
export interface InitiativeRoster {
  directorId: string;
  coDirectorIds: string[];
  teamIds: string[];
}
```

- [ ] **Step 1.4: Update `initiativeRosterSchema`**

Replace the schema in `initiative-schema.ts`:

```ts
export const initiativeRosterSchema = z
  .object({
    directorId: z.string().min(1, "Requerido."),
    coDirectorIds: z.array(z.string().min(1)),
    teamIds: z.array(z.string().min(1)),
  })
  .superRefine((r, ctx) => {
    if (r.coDirectorIds.includes(r.directorId)) {
      ctx.addIssue({
        code: "custom",
        message: "El codirector no puede ser el director.",
        path: ["coDirectorIds"],
      });
    }
    if (new Set(r.coDirectorIds).size !== r.coDirectorIds.length) {
      ctx.addIssue({
        code: "custom",
        message: "Codirectores duplicados.",
        path: ["coDirectorIds"],
      });
    }
    if (r.teamIds.includes(r.directorId)) {
      ctx.addIssue({
        code: "custom",
        message: "El director no puede estar en el equipo.",
        path: ["teamIds"],
      });
    }
    if (r.coDirectorIds.some((id) => r.teamIds.includes(id))) {
      ctx.addIssue({
        code: "custom",
        message: "El codirector no puede estar en el equipo.",
        path: ["teamIds"],
      });
    }
  });
export type InitiativeRosterInput = z.infer<typeof initiativeRosterSchema>;
```

- [ ] **Step 1.5: Run types tests + build**

Run: `pnpm --filter @luminova/types run test && pnpm --filter @luminova/types run build`
Expected: tests PASS; build emits `dist/`. (Downstream apps break — fixed in Tasks 4 & 7; don't run their CI yet.)

- [ ] **Step 1.6: Commit**

```bash
git add packages/types/src/engine/initiative.ts packages/types/src/engine/initiative-schema.ts packages/types/src/engine/initiative-schema.test.ts
git commit -m "feat(types): roster coDirectorId -> coDirectorIds[] (C1-lite)"
```

---

### Task 2: Rich initiative fields (InitiativeCore, areas, impact, photos)

**Files:**
- Modify: `packages/types/src/engine/initiative.ts`
- Modify: `packages/types/src/engine/initiative-schema.ts`
- Modify: `packages/types/src/engine/program.ts`, `packages/types/src/engine/project.ts`
- Modify: `packages/types/src/engine/index.ts`
- Test: `packages/types/src/engine/initiative-schema.test.ts`

- [ ] **Step 2.1: Write failing tests**

Append to `initiative-schema.test.ts`:

```ts
import {
  initiativeFormSchema,
  initiativeImpactSchema,
} from "./initiative-schema.js";

const VALID_FORM = {
  title: "Reciclá Santa Cruz",
  description: "Puntos de reciclaje y educación ambiental en cinco barrios.",
  category: "DesarrolloComunitario",
  startDate: "2026-02-01",
  endDate: "2026-08-31",
  roster: { directorId: "m1", coDirectorIds: [], teamIds: [] },
  status: "EnEjecucion",
};

describe("initiativeFormSchema (C1-lite fields)", () => {
  it("accepts a complete form", () => {
    expect(initiativeFormSchema.safeParse(VALID_FORM).success).toBe(true);
  });
  it("rejects an unknown category", () => {
    expect(initiativeFormSchema.safeParse({ ...VALID_FORM, category: "MedioAmbiente" }).success).toBe(false);
  });
  it("rejects endDate before startDate", () => {
    expect(
      initiativeFormSchema.safeParse({ ...VALID_FORM, startDate: "2026-09-01", endDate: "2026-02-01" }).success,
    ).toBe(false);
  });
  it("rejects a short description", () => {
    expect(initiativeFormSchema.safeParse({ ...VALID_FORM, description: "corto" }).success).toBe(false);
  });
});

describe("initiativeImpactSchema", () => {
  const VALID_IMPACT = {
    personsImpacted: 600,
    volunteers: 45,
    custom: [{ label: "Juguetes entregados", value: "1.200" }],
    closingSummary: "Tres jornadas de entrega; superamos la meta de 500 niños.",
  };
  it("accepts a complete impact", () => {
    expect(initiativeImpactSchema.safeParse(VALID_IMPACT).success).toBe(true);
  });
  it("rejects negative numbers", () => {
    expect(initiativeImpactSchema.safeParse({ ...VALID_IMPACT, personsImpacted: -1 }).success).toBe(false);
  });
  it("rejects an empty custom metric label", () => {
    expect(
      initiativeImpactSchema.safeParse({
        ...VALID_IMPACT,
        custom: [{ label: "", value: "3" }],
      }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2.2: Run to verify failure**

Run: `pnpm --filter @luminova/types run test`
Expected: FAIL (`initiativeImpactSchema` not exported; form schema lacks fields).

- [ ] **Step 2.3: Extend `initiative.ts`**

Add (keeping `INITIATIVE_STATUSES`, `InitiativeRoster`, `FinalReport` as-is):

```ts
export const AREAS_OF_OPPORTUNITY = [
  "DesarrolloIndividual",
  "DesarrolloComunitario",
  "NegociosEmprendimiento",
  "CooperacionInternacional",
] as const;
export type AreaOfOpportunity = (typeof AREAS_OF_OPPORTUNITY)[number];

export const AREA_OF_OPPORTUNITY_LABELS: Record<AreaOfOpportunity, string> = {
  DesarrolloIndividual: "Desarrollo Individual",
  DesarrolloComunitario: "Desarrollo Comunitario",
  NegociosEmprendimiento: "Negocios y Emprendimiento",
  CooperacionInternacional: "Cooperación Internacional",
};

export interface ImpactMetric {
  label: string;
  value: string;
}

/** Captured by the completion wizard; null until the initiative is Finalizado. */
export interface InitiativeImpact {
  personsImpacted: number;
  volunteers: number;
  custom: ImpactMetric[];
  closingSummary: string;
}

/** Shared with Activity. Metadata here; the binary lives in Storage. */
export interface Photo {
  id: string;
  url: string;
  caption: string | null;
  uploadedAt: Timestamp;
  uploadedBy: string;
}

/**
 * Shared core — Program and Project are this shape verbatim, but stay distinct
 * collections/entities (the engine and point codes distinguish them).
 * `directionUids` is engine-written (beacon mirrors roster direction member uids
 * for the firestore.rules direction branch); clients never write it.
 */
export interface InitiativeCore {
  id: string;
  termId: string;
  title: string;
  description: string;
  category: AreaOfOpportunity;
  startDate: Timestamp;
  endDate: Timestamp;
  roster: InitiativeRoster;
  photos: Photo[];
  impact: InitiativeImpact | null;
  finalReport: FinalReport | null;
  status: InitiativeStatus;
  directionUids: string[];
}
```

(`initiative.ts` must now `import type { Timestamp } from "./timestamp.js";` — it already does for `FinalReport`.)

- [ ] **Step 2.4: Collapse `program.ts` / `project.ts` onto the core**

`program.ts`:

```ts
import type { InitiativeCore } from "./initiative.js";

/** Program — distinct from Project (different core narrative + distinct point codes). */
export type Program = InitiativeCore;
```

`project.ts`:

```ts
import type { InitiativeCore } from "./initiative.js";

/** Project — distinct from Program. Dossier fields (C2) still pending award criteria. */
export type Project = InitiativeCore;
```

- [ ] **Step 2.5: Extend `initiative-schema.ts`**

```ts
import { AREAS_OF_OPPORTUNITY, INITIATIVE_STATUSES } from "./initiative.js";

export const initiativeFormSchema = z
  .object({
    title: z.string().min(3, "Mínimo 3 caracteres."),
    description: z.string().min(10, "Mínimo 10 caracteres."),
    category: z.enum(AREAS_OF_OPPORTUNITY),
    startDate: z.string().min(1, "Requerido."),
    endDate: z.string().min(1, "Requerido."),
    roster: initiativeRosterSchema,
    status: z.enum(INITIATIVE_STATUSES),
  })
  .superRefine((v, ctx) => {
    if (v.endDate < v.startDate) {
      ctx.addIssue({
        code: "custom",
        message: "El cierre no puede ser antes del inicio.",
        path: ["endDate"],
      });
    }
  });
export type InitiativeInput = z.infer<typeof initiativeFormSchema>;

export const impactMetricSchema = z.object({
  label: z.string().min(1, "Requerido."),
  value: z.string().min(1, "Requerido."),
});

export const initiativeImpactSchema = z.object({
  personsImpacted: z.number().int().min(0, "Debe ser 0 o más."),
  volunteers: z.number().int().min(0, "Debe ser 0 o más."),
  custom: z.array(impactMetricSchema),
  closingSummary: z.string().min(10, "Mínimo 10 caracteres."),
});
export type InitiativeImpactInput = z.infer<typeof initiativeImpactSchema>;
```

(ISO `YYYY-MM-DD` strings compare correctly with `<`.)

- [ ] **Step 2.6: Export from `engine/index.ts`**

Extend the existing `initiative.js` export lines:

```ts
export type {
  InitiativeRoster,
  FinalReport,
  InitiativeStatus,
  AreaOfOpportunity,
  ImpactMetric,
  InitiativeImpact,
  Photo,
  InitiativeCore,
} from "./initiative.js";
export {
  INITIATIVE_STATUSES,
  AREAS_OF_OPPORTUNITY,
  AREA_OF_OPPORTUNITY_LABELS,
} from "./initiative.js";
```

Also export the new schemas wherever `initiativeFormSchema` is currently exported (follow the existing schema export lines in the same file/`packages/types/src/index.ts`):

```ts
export {
  impactMetricSchema,
  initiativeImpactSchema,
} from "./initiative-schema.js";
export type { InitiativeImpactInput } from "./initiative-schema.js";
```

- [ ] **Step 2.7: Run tests + build**

Run: `pnpm --filter @luminova/types run test && pnpm --filter @luminova/types run build`
Expected: PASS.

- [ ] **Step 2.8: Commit**

```bash
git add packages/types/src/engine/
git commit -m "feat(types): InitiativeCore — areas, dates, impact, photos, directionUids"
```

---

### Task 3: Activity richening (title, endAt, photos, coDirectorIds)

**Files:**
- Modify: `packages/types/src/engine/activity.ts`
- Modify: `packages/types/src/engine/activity-schema.ts`
- Test: `packages/types/src/engine/activity-schema.test.ts`

- [ ] **Step 3.1: Write failing tests**

In `activity-schema.test.ts`, update fixtures: every `coDirectorId: <x>` → `coDirectorIds: []`, and every valid fixture gains `title: "Jornada en La Cuchilla"`, `description: ""`, `endAt: null`. Add:

```ts
it("rejects a missing title", () => {
  expect(activitySchema.safeParse({ ...VALID, title: "" }).success).toBe(false);
});

it("rejects endAt before startAt", () => {
  expect(
    activitySchema.safeParse({
      ...VALID,
      startAt: "2026-06-20T18:00",
      endAt: "2026-06-20T17:00",
    }).success,
  ).toBe(false);
});

it("accepts endAt null", () => {
  expect(activitySchema.safeParse({ ...VALID, endAt: null }).success).toBe(true);
});

it("rejects the director among co-directors", () => {
  expect(
    activitySchema.safeParse({ ...VALID, directorId: "m1", coDirectorIds: ["m1"] }).success,
  ).toBe(false);
});
```

(`VALID` = the file's existing valid-input fixture, renamed/adjusted if needed.)

- [ ] **Step 3.2: Run to verify failure**

Run: `pnpm --filter @luminova/types run test`
Expected: FAIL.

- [ ] **Step 3.3: Update `activity.ts`**

```ts
/** Activity-level direction (informational on parented activities — awards nothing; see spec decision 9). */
export interface ActivityOrganizers {
  directorId: string | null;
  coDirectorIds: string[];
}

export interface Activity {
  id: string;
  termId: string;
  title: string;
  description: string | null;
  category: ActivityCategory;
  parentType: InitiativeKind | null;
  parentId: string | null;
  organizers: ActivityOrganizers;
  startAt: Timestamp;
  endAt: Timestamp | null;
  photos: Photo[];
  status: ActivityStatus;
}
```

Add `import type { Photo } from "./initiative.js";`.

- [ ] **Step 3.4: Update `activity-schema.ts`**

```ts
export const activitySchema = z
  .object({
    title: z.string().min(3, "Mínimo 3 caracteres."),
    description: z.string(),
    category: z.enum(ACTIVITY_CATEGORIES),
    parentType: z.enum(["Program", "Project"]).nullable(),
    parentId: z.string().min(1).nullable(),
    startAt: z.string().min(1, "Requerido."),
    endAt: z.string().min(1).nullable(),
    directorId: z.string().min(1).nullable(),
    coDirectorIds: z.array(z.string().min(1)),
  })
  .superRefine((value, ctx) => {
    const isExecution = value.category === "ProjectExecution";
    const hasParent = value.parentType !== null && value.parentId !== null;
    if (isExecution && !hasParent) {
      ctx.addIssue({
        code: "custom",
        message: "Una ejecución requiere un programa o proyecto padre.",
        path: ["parentId"],
      });
    }
    if (!isExecution && hasParent) {
      ctx.addIssue({
        code: "custom",
        message: "Una actividad institucional no lleva padre.",
        path: ["parentId"],
      });
    }
    if (value.endAt !== null && value.endAt < value.startAt) {
      ctx.addIssue({
        code: "custom",
        message: "El fin no puede ser antes del inicio.",
        path: ["endAt"],
      });
    }
    if (value.directorId !== null && value.coDirectorIds.includes(value.directorId)) {
      ctx.addIssue({
        code: "custom",
        message: "El codirector no puede ser el director.",
        path: ["coDirectorIds"],
      });
    }
  });
```

(`datetime-local` strings — `YYYY-MM-DDTHH:mm` — also compare correctly with `<`.)

- [ ] **Step 3.5: Run tests + build**

Run: `pnpm --filter @luminova/types run test && pnpm --filter @luminova/types run build`
Expected: PASS.

- [ ] **Step 3.6: Commit**

```bash
git add packages/types/src/engine/activity.ts packages/types/src/engine/activity-schema.ts packages/types/src/engine/activity-schema.test.ts
git commit -m "feat(types): activity title/endAt/photos + coDirectorIds"
```

---

### Task 4: Beacon — multi-co-director expansion

**Files:**
- Modify: `apps/beacon/src/award-points/store.ts:24` (InitiativeWrite roster)
- Modify: `apps/beacon/src/award-points/derive-roster.ts:12` (desiredRosterRoles)
- Modify: `apps/beacon/src/award-points/firestore-store.ts:27-30` (parseInitiativeWrite)
- Modify: `apps/beacon/src/index.ts:62` (deleted-initiative empty roster)
- Test: `apps/beacon/src/award-points/derive-roster.test.ts`, `apps/beacon/src/award-points/firestore-store.test.ts`, `apps/beacon/src/award-points/process.test.ts`

- [ ] **Step 4.1: Write failing tests**

`derive-roster.test.ts` — update fixtures `coDirectorId` → `coDirectorIds` and add:

```ts
it("expands every co-director", () => {
  const roles = desiredRosterRoles({
    directorId: "m1",
    coDirectorIds: ["m2", "m3"],
    teamIds: ["m4"],
  });
  expect(roles).toEqual([
    { memberId: "m1", role: "Director" },
    { memberId: "m2", role: "CoDirector" },
    { memberId: "m3", role: "CoDirector" },
    { memberId: "m4", role: "Team" },
  ]);
});
```

`process.test.ts` — update `InitiativeWrite` fixtures to `coDirectorIds: [...]`; add a reconcile test: write with `coDirectorIds: ["m2", "m3"]` creates two CoDirector rows; a second write with `coDirectorIds: ["m2"]` deletes m3's row and recomputes m3's aggregate. Also add the decision-9 regression test:

```ts
it("never derives direction rows from activity organizers (decision 9)", async () => {
  // The store's activities carry organizers; only roster + check-ins produce rows.
  // Reconcile an initiative whose child activity has organizers set and assert the
  // only rows present are the roster-derived ones.
});
```

(Implement the body against the in-memory fake used by the file's existing tests — seed an activity with `organizers: { directorId: "mX", coDirectorIds: ["mY"] }`, run `processInitiativeWrite`, assert no participation exists for `mX`/`mY`.)

`firestore-store.test.ts` — update `parseInitiativeWrite` fixtures; add:

```ts
it("parses coDirectorIds and drops unclean ids", () => {
  const init = parseInitiativeWrite({
    termId: "2026",
    roster: { directorId: "m1", coDirectorIds: ["m2", "bad__id", "a/b"], teamIds: [] },
  });
  expect(init?.roster.coDirectorIds).toEqual(["m2"]);
});
```

- [ ] **Step 4.2: Run to verify failure**

Run: `pnpm --filter beacon run test`
Expected: FAIL (compile errors on the new roster shape).

- [ ] **Step 4.3: Update `store.ts`**

```ts
/** The initiative facts the engine needs from a programs/projects write. */
export interface InitiativeWrite {
  termId: string;
  roster: { directorId: string; coDirectorIds: string[]; teamIds: string[] };
  reportFiled: boolean;
  filedAtMillis: number | null;
}
```

- [ ] **Step 4.4: Update `desiredRosterRoles`**

```ts
export function desiredRosterRoles(
  roster: InitiativeWrite["roster"],
): { memberId: string; role: RosterRole }[] {
  const out: { memberId: string; role: RosterRole }[] = [];
  if (roster.directorId) out.push({ memberId: roster.directorId, role: "Director" });
  for (const id of roster.coDirectorIds ?? []) {
    if (id) out.push({ memberId: id, role: "CoDirector" });
  }
  for (const id of roster.teamIds ?? []) {
    if (id) out.push({ memberId: id, role: "Team" });
  }
  return out;
}
```

- [ ] **Step 4.5: Update `parseInitiativeWrite`**

```ts
  const r = (raw.roster ?? {}) as Record<string, unknown>;
  const directorId = isCleanId(r.directorId) ? r.directorId : "";
  const coDirectorIds = Array.isArray(r.coDirectorIds) ? r.coDirectorIds.filter(isCleanId) : [];
  const teamIds = Array.isArray(r.teamIds) ? r.teamIds.filter(isCleanId) : [];

  return { termId, roster: { directorId, coDirectorIds, teamIds }, reportFiled, filedAtMillis };
```

- [ ] **Step 4.6: Update the deleted-initiative branch in `index.ts`**

```ts
          roster: { directorId: "", coDirectorIds: [], teamIds: [] },
```

- [ ] **Step 4.7: Run beacon CI**

Run: `pnpm --filter beacon run ci`
Expected: PASS (eslint → tsc → vitest).

- [ ] **Step 4.8: Commit**

```bash
git add apps/beacon/src/
git commit -m "feat(beacon): expand coDirectorIds[] in roster reconciliation"
```

---

### Task 5: Beacon — `directionUids` denormalization

**Files:**
- Modify: `apps/beacon/src/award-points/store.ts` (two new `EngineStore` methods)
- Modify: `apps/beacon/src/award-points/process.ts` (mirror step in `processInitiativeWrite`)
- Modify: `apps/beacon/src/award-points/firestore-store.ts` (impl)
- Test: `apps/beacon/src/award-points/process.test.ts`, `apps/beacon/src/award-points/firestore-store.test.ts`

- [ ] **Step 5.1: Write failing tests**

`process.test.ts` (extend the in-memory fake store with the two new methods — record calls):

```ts
it("mirrors direction uids (director + co-directors, not team)", async () => {
  // members: m1 -> uid "u1", m2 -> uid "u2", m4 (team) -> uid "u4"
  await processInitiativeWrite(store, "Project", "p1", {
    termId: "2026",
    roster: { directorId: "m1", coDirectorIds: ["m2"], teamIds: ["m4"] },
    reportFiled: false,
    filedAtMillis: null,
  }, now);
  expect(store.directionUidsWrites).toEqual([
    { parentType: "Project", parentId: "p1", uids: ["u1", "u2"] },
  ]);
});
```

`firestore-store.test.ts` (these tests run against whatever harness the file already uses — follow its existing setup):

```ts
it("setInitiativeDirectionUids skips the write when sorted uids are unchanged", async () => {
  // doc projects/p1 already has directionUids ["u1", "u2"]
  await store.setInitiativeDirectionUids("Project", "p1", ["u2", "u1"]);
  // assert no write happened (loop-termination guard)
});

it("setInitiativeDirectionUids no-ops when the doc is missing", async () => {
  await store.setInitiativeDirectionUids("Project", "ghost", ["u1"]);
});

it("getMemberUids skips members without a uid", async () => {
  // members/m1 { uid: "u1" }, members/m9 {} -> ["u1"]
});
```

- [ ] **Step 5.2: Run to verify failure**

Run: `pnpm --filter beacon run test`
Expected: FAIL (methods missing on `EngineStore`).

- [ ] **Step 5.3: Extend `EngineStore`**

Add to the interface in `store.ts`:

```ts
  /** Resolve member ids -> linked auth uids (members without a login are skipped). */
  getMemberUids(memberIds: string[]): Promise<string[]>;
  /**
   * Mirror direction uids onto the initiative doc (rules read them). Must be
   * idempotent and skip identical values — this runs inside the initiative's own
   * trigger, so an unconditional write would loop.
   */
  setInitiativeDirectionUids(
    parentType: InitiativeKind,
    parentId: string,
    uids: string[],
  ): Promise<void>;
```

- [ ] **Step 5.4: Add the mirror step to `processInitiativeWrite`**

Insert before the final aggregate-recompute loop (step 4) in `process.ts`:

```ts
  // 4. Mirror direction (director + co-directors) auth uids for the rules branch.
  const directionMemberIds = [init.roster.directorId, ...init.roster.coDirectorIds].filter(
    (id) => id !== "",
  );
  const uids = await store.getMemberUids(directionMemberIds);
  await store.setInitiativeDirectionUids(parentType, parentId, uids);
```

(Renumber the old step-4 comment to 5.)

- [ ] **Step 5.5: Implement in `firestore-store.ts`**

```ts
    async getMemberUids(memberIds) {
      const uids: string[] = [];
      for (const id of memberIds) {
        const snap = await db.doc(`members/${id}`).get();
        const uid = snap.exists ? (snap.data() as { uid?: unknown }).uid : undefined;
        if (typeof uid === "string" && uid.length > 0) uids.push(uid);
      }
      return uids;
    },
    async setInitiativeDirectionUids(parentType, parentId, uids) {
      const collection = parentType === "Program" ? "programs" : "projects";
      const ref = db.doc(`${collection}/${parentId}`);
      const snap = await ref.get();
      if (!snap.exists) return; // deleted initiative — nothing to mirror
      const sorted = [...uids].sort();
      const current = (snap.data() as { directionUids?: unknown }).directionUids;
      const same =
        Array.isArray(current) &&
        current.length === sorted.length &&
        [...current].sort().every((v, i) => v === sorted[i]);
      if (same) return; // identical — break the write->trigger loop
      await ref.set({ directionUids: sorted }, { merge: true });
    },
```

- [ ] **Step 5.6: Run beacon CI**

Run: `pnpm --filter beacon run ci`
Expected: PASS.

- [ ] **Step 5.7: Commit**

```bash
git add apps/beacon/src/
git commit -m "feat(beacon): mirror directionUids onto initiatives for rules"
```

---

### Task 6: firestore.rules — direction branch + completion lock

**Files:**
- Modify: `firestore.rules:25-31` (projects) and `:87-91` (programs)
- Test: `tests/firestore-rules/rules.test.ts`

- [ ] **Step 6.1: Write failing rules tests**

In `rules.test.ts` seed block (`withSecurityRulesDisabled`), add a direction-managed project and a completed one:

```ts
    await setDoc(doc(db, "projects/p_dir"), {
      termId: "2026",
      title: "Eco",
      roster: { directorId: "m1", coDirectorIds: [], teamIds: [] },
      directionUids: ["owner-uid"],
      finalReport: null,
      impact: null,
      status: "EnEjecucion",
    });
    await setDoc(doc(db, "projects/p_done"), {
      termId: "2026",
      title: "Done",
      roster: { directorId: "m1", coDirectorIds: [], teamIds: [] },
      directionUids: ["owner-uid"],
      finalReport: { filedAt: new Date("2026-05-01T00:00:00Z"), filedBy: "owner-uid" },
      impact: { personsImpacted: 1, volunteers: 1, custom: [], closingSummary: "x" },
      status: "Finalizado",
    });
```

Add a describe block (note: `as("owner-uid", ["Member"])` — `owner-uid` matches `members/m1.uid` already seeded):

```ts
describe("firestore.rules — initiative direction branch", () => {
  it("lets a direction uid update status", async () => {
    await assertSucceeds(
      updateDoc(doc(as("owner-uid", ["Member"]), "projects/p_dir"), { status: "Planificacion" }),
    );
  });
  it("denies a non-direction member", async () => {
    await assertFails(
      updateDoc(doc(as("other-uid", ["Member"]), "projects/p_dir"), { status: "Planificacion" }),
    );
  });
  it("denies direction touching directionUids", async () => {
    await assertFails(
      updateDoc(doc(as("owner-uid", ["Member"]), "projects/p_dir"), {
        directionUids: ["owner-uid", "evil-uid"],
      }),
    );
  });
  it("denies changing termId even for Admin", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["Admin"]), "projects/p_dir"), { termId: "2027" }),
    );
  });
  it("locks status once finalReport is filed (even Admin)", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["Admin"]), "projects/p_done"), { status: "EnEjecucion" }),
    );
  });
  it("locks finalReport and impact once filed", async () => {
    await assertFails(
      updateDoc(doc(as("u", ["Admin"]), "projects/p_done"), { finalReport: null }),
    );
    await assertFails(
      updateDoc(doc(as("u", ["Admin"]), "projects/p_done"), {
        impact: { personsImpacted: 9, volunteers: 9, custom: [], closingSummary: "edit" },
      }),
    );
  });
  it("still allows title edits on a completed initiative", async () => {
    await assertSucceeds(
      updateDoc(doc(as("u", ["Admin"]), "projects/p_done"), { title: "Done (renombrado)" }),
    );
  });
  it("denies create with non-empty directionUids", async () => {
    await assertFails(
      setDoc(doc(as("u", ["ProjectManager"]), "projects/p_new"), {
        termId: "2026",
        title: "X",
        directionUids: ["u"],
        finalReport: null,
      }),
    );
  });
  it("allows PM create without directionUids", async () => {
    await assertSucceeds(
      setDoc(doc(as("u", ["ProjectManager"]), "projects/p_new2"), {
        termId: "2026",
        title: "X",
        finalReport: null,
      }),
    );
  });
});
```

- [ ] **Step 6.2: Run to verify failure** (emulator must be running on 4010 — `pnpm emulators` or per `docs/firebase-setup.md`)

Run: `pnpm --filter ./tests/firestore-rules run test`
Expected: new tests FAIL (direction branch absent).

- [ ] **Step 6.3: Update `firestore.rules`**

Add helpers next to `softDeleteSafe()`:

```
    // Missing-key-safe comparison (docs created before a field existed).
    function unchangedOrAbsent(field) {
      return request.resource.data.get(field, null) == resource.data.get(field, null);
    }
    // The initiative's direction: director + co-directors, mirrored to uids by beacon.
    function isDirection() {
      return signedIn() && request.auth.uid in resource.data.get('directionUids', []);
    }
    // directionUids is beacon-written; termId is immutable; once the final report
    // is filed the completion trio (finalReport/status/impact) is locked — clearing
    // the report would silently un-confirm awarded points.
    function initiativeWriteSafe() {
      return unchangedOrAbsent('directionUids')
        && unchangedOrAbsent('termId')
        && (resource.data.get('finalReport', null) == null
            || (unchangedOrAbsent('finalReport')
                && unchangedOrAbsent('status')
                && unchangedOrAbsent('impact')));
    }
```

Replace both the `projects` and `programs` match blocks' write rules (reads unchanged):

```
    match /projects/{projectId} {
      // D1 added member-id rosters to projects; restrict to signed-in (was public).
      // C4's Spotlight projection will expose curated public fields, not raw docs.
      allow read: if signedIn();
      allow create: if hasAnyRole(['Admin', 'ProjectManager'])
        && request.resource.data.get('directionUids', []) == []
        && request.resource.data.get('finalReport', null) == null;
      allow update: if (hasAnyRole(['Admin', 'ProjectManager']) || isDirection())
        && initiativeWriteSafe();
      allow delete: if false;
    }
```

(Identical block body for `match /programs/{programId}`, keeping its existing comment.)

- [ ] **Step 6.4: Run rules tests**

Run: `pnpm --filter ./tests/firestore-rules run test`
Expected: PASS, including all pre-existing programs/projects tests.

- [ ] **Step 6.5: Commit**

```bash
git add firestore.rules tests/firestore-rules/rules.test.ts
git commit -m "feat(rules): initiative direction update branch + completion lock"
```

---

### Task 7: Backstage compile-green (forms, mappers, routes)

UX redesign lands in slices 2–4 — this task only keeps current pages working on the new shapes.

**Files:**
- Modify: `apps/backstage/src/components/initiative-form.tsx`
- Modify: `apps/backstage/src/components/initiative-form.test.tsx`
- Modify: `apps/backstage/src/features/programs/repositories/program-mapper.ts` (+ its `.test.ts`)
- Modify: `apps/backstage/src/features/projects/repositories/project-mapper.ts` (+ its `.test.ts`)
- Modify: `apps/backstage/src/routes/_app.programs.tsx:22-24`, `_app.projects.tsx` (the `*ToInput` helpers)
- Modify: `apps/backstage/src/features/activities/components/activity-form.tsx`
- Modify: `apps/backstage/src/features/activities/repositories/activity-mapper.ts` (+ its `.test.ts`)
- Modify: `apps/backstage/src/routes/_app.activities.tsx:33`

- [ ] **Step 7.1: Update mapper tests (failing)**

`program-mapper.test.ts` / `project-mapper.test.ts`: inputs gain `description`, `category`, `startDate: "2026-02-01"`, `endDate: "2026-08-31"`, roster `coDirectorIds: []`. Expected create doc:

```ts
{
  termId: "2026",
  title: input.title,
  description: input.description,
  category: input.category,
  startDate: Timestamp.fromDate(new Date("2026-02-01T00:00:00Z")),
  endDate: Timestamp.fromDate(new Date("2026-08-31T00:00:00Z")),
  roster: input.roster,
  status: input.status,
  photos: [],
  impact: null,
  finalReport: null,
  directionUids: [],
}
```

Expected update doc: same minus `termId`/`photos`/`impact`/`finalReport` (update must never clobber engine/wizard/gallery fields). Add an explicit test:

```ts
it("update doc never touches photos/impact/finalReport/directionUids", () => {
  const docData = toProgramUpdateDoc(VALID_INPUT);
  expect(Object.keys(docData).sort()).toEqual([
    "category", "description", "endDate", "roster", "startDate", "status", "title",
  ]);
});
```

`activity-mapper.test.ts`: inputs gain `title`, `description: ""`, `endAt: null`, `coDirectorIds: []`; create doc gains `title`, `description: null` (empty string → null), `endAt: null`, `photos: []`, organizers `{ directorId, coDirectorIds }`; update doc gains `title`/`description`/`endAt` and must not include `photos`.

- [ ] **Step 7.2: Run to verify failure**

Run: `pnpm --filter backstage run test`
Expected: FAIL.

- [ ] **Step 7.3: Update the initiative mappers**

`program-mapper.ts` (project-mapper identical with `Project` names):

```ts
import { Timestamp } from "firebase/firestore";
import type { ProgramInput } from "@luminova/types";

/** `date` input ("YYYY-MM-DD") → Timestamp at midnight UTC (round-trips TZ-stable). */
function toDateTimestamp(value: string): Timestamp {
  return Timestamp.fromDate(new Date(`${value}T00:00:00Z`));
}

export function toProgramCreateDoc(data: ProgramInput, termId: string) {
  return {
    termId,
    title: data.title,
    description: data.description,
    category: data.category,
    startDate: toDateTimestamp(data.startDate),
    endDate: toDateTimestamp(data.endDate),
    roster: data.roster,
    status: data.status,
    photos: [],
    impact: null,
    finalReport: null,
    directionUids: [],
  };
}

/** Form-owned fields only — photos/impact/finalReport/directionUids are owned elsewhere. */
export function toProgramUpdateDoc(data: ProgramInput) {
  return {
    title: data.title,
    description: data.description,
    category: data.category,
    startDate: toDateTimestamp(data.startDate),
    endDate: toDateTimestamp(data.endDate),
    roster: data.roster,
    status: data.status,
  };
}
```

- [ ] **Step 7.4: Update `initiative-form.tsx`**

- `EMPTY`: `{ title: "", description: "", category: "DesarrolloComunitario", startDate: "", endDate: "", roster: { directorId: "", coDirectorIds: [], teamIds: [] }, status: "Planificacion" }`
- Add after the title field:

```tsx
      <Field
        label="Descripción"
        htmlFor="description"
        required
        error={errors.description?.message}
      >
        <Textarea id="description" rows={3} {...register("description")} />
      </Field>
      <Field label="Área de oportunidad" htmlFor="category" required error={errors.category?.message}>
        <Select id="category" {...register("category")}>
          {AREAS_OF_OPPORTUNITY.map((a) => (
            <option key={a} value={a}>
              {AREA_OF_OPPORTUNITY_LABELS[a]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Inicio" htmlFor="startDate" required error={errors.startDate?.message}>
          <Input id="startDate" type="date" {...register("startDate")} />
        </Field>
        <Field label="Cierre estimado" htmlFor="endDate" required error={errors.endDate?.message}>
          <Input id="endDate" type="date" {...register("endDate")} />
        </Field>
      </div>
```

- Replace the Codirector `Combobox` with a `MultiSelect` on `roster.coDirectorIds` (same pattern as the Equipo field, placeholder `"Elegir codirectores (opcional)"`).
- Imports: add `Textarea`, `MultiSelect` already imported; add `AREAS_OF_OPPORTUNITY`, `AREA_OF_OPPORTUNITY_LABELS` from `@luminova/types`.
- Update `initiative-form.test.tsx` fixtures to the new `InitiativeInput` shape.

- [ ] **Step 7.5: Update the route input helpers**

`_app.programs.tsx` (and the `projectToInput` twin in `_app.projects.tsx`):

```tsx
function programToInput(p: Program): Partial<ProgramInput> {
  return {
    title: p.title,
    description: p.description,
    category: p.category,
    startDate: p.startDate.toDate().toISOString().slice(0, 10),
    endDate: p.endDate.toDate().toISOString().slice(0, 10),
    roster: p.roster,
    status: p.status,
  };
}
```

- [ ] **Step 7.6: Update the activity surface**

`activity-mapper.ts`:

```ts
export function toActivityCreateDoc(data: ActivityInput, termId: string) {
  return {
    termId,
    title: data.title,
    description: data.description === "" ? null : data.description,
    category: data.category,
    parentType: data.parentType,
    parentId: data.parentId,
    organizers: { directorId: data.directorId, coDirectorIds: data.coDirectorIds },
    startAt: toTimestamp(data.startAt),
    endAt: data.endAt === null ? null : toTimestamp(data.endAt),
    photos: [],
    status: "Programada" as const,
  };
}

export function toActivityUpdateDoc(data: ActivityInput) {
  return {
    title: data.title,
    description: data.description === "" ? null : data.description,
    category: data.category,
    parentType: data.parentType,
    parentId: data.parentId,
    organizers: { directorId: data.directorId, coDirectorIds: data.coDirectorIds },
    startAt: toTimestamp(data.startAt),
    endAt: data.endAt === null ? null : toTimestamp(data.endAt),
  };
}
```

`activity-form.tsx`: `EMPTY` gains `title: ""`, `description: ""`, `endAt: null`, `coDirectorIds: []`; add a required "Título" `Input` above Categoría; replace the Codirector `Combobox` with a `MultiSelect` on `coDirectorIds`. (Leave `endAt` out of the form UI — slice 4 redesigns this page; `EMPTY.endAt: null` keeps the schema satisfied.)

`_app.activities.tsx:33`: `coDirectorIds: a.organizers.coDirectorIds` (and pass `title`/`description`/`endAt` through the same `activityToInput`-style helper — follow the surrounding lines, mapping `endAt` with the same `datetime-local` slice used for `startAt`).

- [ ] **Step 7.7: Run backstage CI**

Run: `pnpm --filter backstage run ci`
Expected: PASS (prettier → eslint → tsc → build → vitest → knip → size-limit).

- [ ] **Step 7.8: Commit**

```bash
git add apps/backstage/src/
git commit -m "feat(backstage): C1-lite fields on initiative/activity forms + mappers"
```

---

### Task 8: Seed + e2e script update (no migration — wipe & reseed)

**Files:**
- Modify: `tools/scripts/seed-emulator.mjs`
- Modify: `tools/scripts/e2e-check-in.mjs:57`

- [ ] **Step 8.1: Update `seed-emulator.mjs`**

- Activities map gains the new fields:

```js
].map((a, i) => ({
  ...a,
  termId: TERM,
  title: ["Asamblea ordinaria junio", "Sesión TM mayo", "Jornada de ejecución"][i],
  description: null,
  organizers: { directorId: null, coDirectorIds: [] },
  endAt: null,
  photos: [],
  status: "Ejecutada",
}));
```

- Seed the referenced parent project (a3 points at `projects/p1`) plus a program, new shape:

```js
// --- Initiatives (C1-lite shape; directionUids is beacon-written, seeded empty) ---
const projects = [
  {
    id: "p1",
    title: "Reciclá Santa Cruz",
    description: "Puntos de reciclaje y educación ambiental en cinco barrios de la ciudad.",
    category: "DesarrolloComunitario",
    startDate: ts("2026-02-01T00:00:00Z"),
    endDate: ts("2026-08-31T00:00:00Z"),
    roster: { directorId: "m1", coDirectorIds: ["m2"], teamIds: ["m3"] },
    photos: [],
    impact: null,
    finalReport: null,
    status: "EnEjecucion",
    directionUids: [],
  },
];
const programs = [
  {
    id: "prog1",
    title: "Líderes del Mañana",
    description: "Programa de formación cívica y liderazgo para colegios de Santa Cruz.",
    category: "DesarrolloIndividual",
    startDate: ts("2026-03-01T00:00:00Z"),
    endDate: ts("2026-12-15T00:00:00Z"),
    roster: { directorId: "m2", coDirectorIds: [], teamIds: [] },
    photos: [],
    impact: null,
    finalReport: null,
    status: "EnEjecucion",
    directionUids: [],
  },
];
```

  And in `seed()`:

```js
  for (const p of projects) {
    const { id, ...data } = p;
    await db.doc(`projects/${id}`).set(data);
  }
  for (const p of programs) {
    const { id, ...data } = p;
    await db.doc(`programs/${id}`).set(data);
  }
```

  Update each `participations` fixture to add `termId: TERM` parent links as today (no change needed — the helper already copies `parentType`/`parentId` from the activity) and bump the final `console.log` to mention the initiatives.

  **Caution:** seeding `projects/p1` with a roster makes the beacon trigger (when the functions emulator is running) expand roster rows + mirror `directionUids` — that is the desired real behavior; the hand-seeded `memberPoints` will be recomputed by it.

- [ ] **Step 8.2: Update `e2e-check-in.mjs:57`**

```js
    organizers: { directorId: null, coDirectorIds: [] },
```

Also add the new activity fields next to it (`title: "E2E ejecución"`, `description: null`, `endAt: null`, `photos: []`) so the seeded doc matches the new shape.

- [ ] **Step 8.3: Smoke-run the seed** (emulators running)

Run: `pnpm seed:emulator`
Expected: exits 0; log line mentions members/term/activities/participations/initiatives.

- [ ] **Step 8.4: Commit**

```bash
git add tools/scripts/seed-emulator.mjs tools/scripts/e2e-check-in.mjs
git commit -m "chore(seed): C1-lite shapes — initiatives, activity titles, coDirectorIds"
```

---

### Task 9: Verification, reviews, PR

- [ ] **Step 9.1: Full gate**

Run: `pnpm pr-tests`
Expected: every workspace CI passes.

- [ ] **Step 9.2: `/simplify` on the branch diff** (feature functionally done)

- [ ] **Step 9.3: Reviews (slice 1 is flagged for all three)**
  - `/security-review` on the diff (rules + functions touched).
  - Dispatch `firebase-functions-reviewer` (beacon changes; use an opus-tier agent).
  - Dispatch `firestore-security-reviewer` (rules + repository-adjacent changes; opus-tier).
  - Apply findings via `superpowers:receiving-code-review` rigor.

- [ ] **Step 9.4: PR**

```bash
git push -u origin feat/initiative-schema
gh pr create --base main --title "feat: initiative schema — C1-lite slice 1" --body "..."
pnpm pr-tests
```

(If the spec PR `chore/initiatives-c1-spec` hasn't merged yet, set `--base` to that branch — stacked.)
