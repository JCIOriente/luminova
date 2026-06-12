# Spotlight "Impacto" Public Showcase (C4) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface completed initiatives on the public site as a curated `/impacto` index + detail showcase, fed by a beacon projection into a public `showcase` collection.

**Architecture:** beacon's existing `onProgramWritten`/`onProjectWritten` triggers gain a projection step: completed initiatives (status==Finalizado) are denormalized — roster ids resolved to member names — into `showcase/{id}` (public-read, beacon-write). `apps/spotlight` (no auth) reads `showcase` via `@luminova/firebase` and renders a grid + detail. Photos use tokenized `getDownloadURL` urls (no storage.rules change).

**Tech Stack:** firebase-admin (beacon), `@luminova/types` (shared contract), `@luminova/firebase` client, TanStack Router, React 19, Tailwind v4, `@luminova/ui`.

**Spec:** `docs/specs/2026-06-12-spotlight-impacto-showcase-design.md`

---

## File Structure

**Shared contract**
- Create `packages/types/src/engine/showcase.ts` — `ShowcaseItem`, `ShowcasePerson`, `ShowcaseTeam`.
- Modify `packages/types/src/engine/index.ts` — export them.

**Beacon (writer)**
- Create `apps/beacon/src/showcase/project-initiative.ts` — pure mapper: parsed doc + name lookup → `ShowcaseItem | null`.
- Create `apps/beacon/src/showcase/project-initiative.test.ts`.
- Modify `apps/beacon/src/index.ts` — projection glue inside `initiativeTrigger`.
- Modify `apps/beacon/src/index.test.ts` if export shape asserted (likely none needed).

**Rules**
- Modify `firestore.rules` — `match /showcase/{id}`.
- Modify `tests/firestore-rules/rules.test.ts` — public-read / no-write tests + a `showcase/s1` seed.

**Spotlight (reader)**
- Modify `apps/spotlight/package.json` — add `@luminova/firebase`, `@luminova/types`.
- Create `apps/spotlight/.env.local.example` (doc) + ensure `vite-env`/env typing.
- Create `apps/spotlight/src/showcase/use-showcase.ts` — `useShowcaseList()`, `useShowcaseItem(id)` (firestore read, no react-query).
- Create `apps/spotlight/src/showcase/showcase-firestore.ts` — snapshot → `ShowcaseItem` mapper (Timestamp-safe) + ordering.
- Create `apps/spotlight/src/showcase/use-showcase.test.ts` (mapper/order/filter unit tests).
- Create `apps/spotlight/src/routes/impacto.index.tsx` — `/impacto` grid.
- Create `apps/spotlight/src/routes/impacto.$id.tsx` — `/impacto/$id` detail.
- Create `apps/spotlight/src/components/showcase/showcase-card.tsx`, `showcase-grid.tsx`, `area-filter.tsx`, `impact-band.tsx`, `photo-gallery.tsx`, `team-credits.tsx`.
- Create matching `*.test.tsx` for grid (order/filter/empty) and detail building blocks.
- Modify `apps/spotlight/src/components/header.tsx` — "Impacto" nav link.
- Modify `apps/spotlight/src/routes/index.tsx` — "Ver todos los programas" → `/impacto`.

---

## Task 1: Shared `ShowcaseItem` contract

**Files:**
- Create: `packages/types/src/engine/showcase.ts`
- Modify: `packages/types/src/engine/index.ts`
- Test: none (pure type module; consumed by beacon + spotlight tests downstream)

- [ ] **Step 1: Write the type module**

```ts
// packages/types/src/engine/showcase.ts
import type { Timestamp } from "./timestamp.js";
import type { AreaOfOpportunity, InitiativeImpact, Photo } from "./initiative.js";
import type { InitiativeKind } from "./activity.js";

export interface ShowcasePerson {
  name: string;
}

export interface ShowcaseTeam {
  director: ShowcasePerson | null;
  coDirectors: ShowcasePerson[];
  members: ShowcasePerson[];
}

/**
 * Curated public projection of a completed initiative, written by beacon into the
 * `showcase` collection (read: true, write: false). Member ids are resolved to
 * display names; no raw initiative/member fields leak. `completedAt` == the
 * initiative's `finalReport.filedAt`.
 */
export interface ShowcaseItem {
  id: string;
  kind: InitiativeKind;
  title: string;
  description: string;
  category: AreaOfOpportunity;
  startDate: Timestamp;
  endDate: Timestamp;
  completedAt: Timestamp;
  impact: InitiativeImpact;
  photos: Photo[];
  team: ShowcaseTeam;
}
```

- [ ] **Step 2: Export from engine barrel**

In `packages/types/src/engine/index.ts` add:
```ts
export type { ShowcasePerson, ShowcaseTeam, ShowcaseItem } from "./showcase.js";
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @luminova/types typecheck`
Expected: PASS (no emit errors).

- [ ] **Step 4: Commit**

```bash
git add packages/types/src/engine/showcase.ts packages/types/src/engine/index.ts
git commit -m "feat(types): ShowcaseItem public projection contract"
```

---

## Task 2: Pure projection mapper (beacon)

Maps a raw initiative doc + a member-name resolver into a `ShowcaseItem`, or `null`
when the initiative is not completed (so the trigger knows to delete any stale doc).
Pure + fully unit-tested — no Firestore.

**Files:**
- Create: `apps/beacon/src/showcase/project-initiative.ts`
- Test: `apps/beacon/src/showcase/project-initiative.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// apps/beacon/src/showcase/project-initiative.test.ts
import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { projectInitiative } from "./project-initiative.js";

const ts = (ms: number) => Timestamp.fromMillis(ms);

function completedDoc(over: Record<string, unknown> = {}) {
  return {
    termId: "2026",
    title: "Eco",
    description: "desc",
    category: "DesarrolloComunitario",
    startDate: ts(1000),
    endDate: ts(2000),
    status: "Finalizado",
    finalReport: { filedAt: ts(3000), filedBy: "u1" },
    impact: { personsImpacted: 1200, volunteers: 30, custom: [], closingSummary: "ok" },
    photos: [{ id: "ph1", url: "https://x/y?token=1", caption: null, uploadedAt: ts(1), uploadedBy: "m1" }],
    roster: { directorId: "m1", coDirectorIds: ["m2"], teamIds: ["m3", "m_missing"] },
    ...over,
  };
}

const names = new Map([
  ["m1", "Ana"],
  ["m2", "Beto"],
  ["m3", "Caro"],
]);
const resolve = (id: string) => names.get(id) ?? null;

describe("projectInitiative", () => {
  it("projects a completed initiative with resolved names + completedAt", () => {
    const item = projectInitiative("Project", "p1", completedDoc(), resolve);
    expect(item).not.toBeNull();
    expect(item!.id).toBe("p1");
    expect(item!.kind).toBe("Project");
    expect(item!.completedAt.toMillis()).toBe(3000);
    expect(item!.team.director).toEqual({ name: "Ana" });
    expect(item!.team.coDirectors).toEqual([{ name: "Beto" }]);
    expect(item!.team.members).toEqual([{ name: "Caro" }]); // m_missing dropped
    expect(item!.impact.personsImpacted).toBe(1200);
    expect(item!.photos).toHaveLength(1);
  });

  it("returns null when not Finalizado", () => {
    expect(projectInitiative("Project", "p1", completedDoc({ status: "EnEjecucion" }), resolve)).toBeNull();
  });

  it("returns null when impact missing", () => {
    expect(projectInitiative("Program", "g1", completedDoc({ impact: null }), resolve)).toBeNull();
  });

  it("returns null when finalReport missing", () => {
    expect(projectInitiative("Program", "g1", completedDoc({ finalReport: null }), resolve)).toBeNull();
  });

  it("director null when unresolvable", () => {
    const item = projectInitiative("Project", "p1", completedDoc({ roster: { directorId: "ghost", coDirectorIds: [], teamIds: [] } }), resolve);
    expect(item!.team.director).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter beacon test -- project-initiative`
Expected: FAIL ("projectInitiative is not a function").

- [ ] **Step 3: Implement the mapper**

```ts
// apps/beacon/src/showcase/project-initiative.ts
import { Timestamp } from "firebase-admin/firestore";
import {
  AREAS_OF_OPPORTUNITY,
  type AreaOfOpportunity,
  type InitiativeImpact,
  type InitiativeKind,
  type Photo,
  type ShowcaseItem,
  type ShowcasePerson,
} from "@luminova/types/engine";

function isTimestamp(v: unknown): v is Timestamp {
  return typeof (v as { toMillis?: unknown })?.toMillis === "function";
}

function asPhotos(v: unknown): Photo[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (p): p is Photo =>
      typeof p === "object" && p !== null && typeof (p as Photo).url === "string" && isTimestamp((p as Photo).uploadedAt),
  );
}

function asImpact(v: unknown): InitiativeImpact | null {
  const i = v as InitiativeImpact | null;
  if (!i || typeof i.personsImpacted !== "number" || typeof i.volunteers !== "number") return null;
  if (typeof i.closingSummary !== "string") return null;
  return {
    personsImpacted: i.personsImpacted,
    volunteers: i.volunteers,
    closingSummary: i.closingSummary,
    custom: Array.isArray(i.custom) ? i.custom : [],
  };
}

function person(id: string, resolve: (id: string) => string | null): ShowcasePerson | null {
  const name = resolve(id);
  return name ? { name } : null;
}

/**
 * Project a raw initiative doc into a curated ShowcaseItem, or null when it is not
 * a completed initiative (status != Finalizado, or impact/finalReport absent) — the
 * trigger deletes any stale showcase doc on null.
 */
export function projectInitiative(
  kind: InitiativeKind,
  id: string,
  data: Record<string, unknown>,
  resolve: (memberId: string) => string | null,
): ShowcaseItem | null {
  if (data.status !== "Finalizado") return null;
  const impact = asImpact(data.impact);
  if (!impact) return null;
  const finalReport = data.finalReport as { filedAt?: unknown } | null | undefined;
  if (!finalReport || !isTimestamp(finalReport.filedAt)) return null;
  if (!AREAS_OF_OPPORTUNITY.includes(data.category as AreaOfOpportunity)) return null;
  if (!isTimestamp(data.startDate) || !isTimestamp(data.endDate)) return null;

  const roster = (data.roster ?? {}) as { directorId?: string; coDirectorIds?: string[]; teamIds?: string[] };
  return {
    id,
    kind,
    title: typeof data.title === "string" ? data.title : "",
    description: typeof data.description === "string" ? data.description : "",
    category: data.category as AreaOfOpportunity,
    startDate: data.startDate,
    endDate: data.endDate,
    completedAt: finalReport.filedAt,
    impact,
    photos: asPhotos(data.photos),
    team: {
      director: roster.directorId ? person(roster.directorId, resolve) : null,
      coDirectors: (roster.coDirectorIds ?? []).map((cid) => person(cid, resolve)).filter((p): p is ShowcasePerson => p !== null),
      members: (roster.teamIds ?? []).map((tid) => person(tid, resolve)).filter((p): p is ShowcasePerson => p !== null),
    },
  };
}

/** All roster ids that need name resolution (director + co-directors + team). */
export function rosterMemberIds(data: Record<string, unknown>): string[] {
  const r = (data.roster ?? {}) as { directorId?: string; coDirectorIds?: string[]; teamIds?: string[] };
  return [...(r.directorId ? [r.directorId] : []), ...(r.coDirectorIds ?? []), ...(r.teamIds ?? [])];
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter beacon test -- project-initiative`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/beacon/src/showcase/
git commit -m "feat(beacon): pure initiative→showcase projection mapper"
```

---

## Task 3: Trigger projection glue (beacon)

Wire the mapper into `initiativeTrigger`: after the existing engine work, resolve
roster names and upsert/delete `showcase/{id}`.

**Files:**
- Modify: `apps/beacon/src/index.ts`

- [ ] **Step 1: Add a projection helper + call it in both write & delete branches**

In `apps/beacon/src/index.ts`, import:
```ts
import { projectInitiative, rosterMemberIds } from "./showcase/project-initiative.js";
```

Add this helper (resolves names via `db.getAll`, chunked at 300 to respect the
getAll limit — mirrors the roster fast-follow note):
```ts
async function resolveMemberNames(
  database: FirebaseFirestore.Firestore,
  ids: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)].filter((id) => id.length > 0);
  const names = new Map<string, string>();
  for (let i = 0; i < unique.length; i += 300) {
    const refs = unique.slice(i, i + 300).map((id) => database.doc(`members/${id}`));
    const snaps = await database.getAll(...refs);
    for (const snap of snaps) {
      const name = snap.get("name");
      if (typeof name === "string") names.set(snap.id, name);
    }
  }
  return names;
}

async function projectShowcase(
  database: FirebaseFirestore.Firestore,
  kind: "Program" | "Project",
  id: string,
  data: Record<string, unknown> | undefined,
): Promise<void> {
  const ref = database.doc(`showcase/${id}`);
  if (!data) {
    await ref.delete();
    return;
  }
  const names = await resolveMemberNames(database, rosterMemberIds(data));
  const item = projectInitiative(kind, id, data, (mid) => names.get(mid) ?? null);
  if (item) await ref.set(item);
  else await ref.delete();
}
```

In `initiativeTrigger`, after `processInitiativeWrite(...)` in the `after.exists`
branch:
```ts
await projectShowcase(db(), parentType, event.params.id, after.data());
```
and in the delete branch (after the void-roster `processInitiativeWrite`):
```ts
await projectShowcase(db(), parentType, event.params.id, undefined);
```

> The projection runs after the engine work so a projection error can't strand
> points. Deleting a non-existent doc is a no-op in Firestore — safe + idempotent.

- [ ] **Step 2: Typecheck + existing beacon tests still pass**

Run: `pnpm --filter beacon typecheck && pnpm --filter beacon test`
Expected: PASS (existing trigger tests unaffected; projection unit-tested in Task 2).

- [ ] **Step 3: Commit**

```bash
git add apps/beacon/src/index.ts
git commit -m "feat(beacon): project completed initiatives into showcase collection"
```

---

## Task 4: `showcase` firestore.rules + tests

**Files:**
- Modify: `firestore.rules`
- Test: `tests/firestore-rules/rules.test.ts`

- [ ] **Step 1: Add failing rules tests**

In `rules.test.ts` `beforeAll` seed (inside `withSecurityRulesDisabled`), add:
```ts
await setDoc(doc(db, "showcase/s1"), { id: "s1", kind: "Project", title: "Eco" });
```
Add a describe block:
```ts
describe("showcase (public read, beacon-only write)", () => {
  it("anyone (anon) can read", async () => {
    await assertSucceeds(getDoc(doc(anon(), "showcase/s1")));
  });
  it("signed-in member can read", async () => {
    await assertSucceeds(getDoc(doc(as("u", ["Member"]), "showcase/s1")));
  });
  it("anon cannot write", async () => {
    await assertFails(setDoc(doc(anon(), "showcase/s2"), { title: "x" }));
  });
  it("admin cannot write (beacon admin SDK only)", async () => {
    await assertFails(setDoc(doc(as("u", ["Admin"]), "showcase/s2"), { title: "x" }));
  });
});
```

- [ ] **Step 2: Run to verify fail**

Free ports first if a stray emulator is up: `lsof -ti tcp:4010 | xargs kill 2>/dev/null; true`
Run: `pnpm --filter @luminova/firestore-rules-tests test` (or the package name in `tests/firestore-rules/package.json`)
Expected: FAIL (writes succeed / reads on missing rule deny — confirm the new tests are red).

- [ ] **Step 3: Add the rule**

In `firestore.rules`, immediately before the final `match /{document=**}` catch-all:
```
// Curated public projection of completed initiatives (beacon admin SDK writes;
// the public marketing site reads it without auth). Curated fields only — no raw
// initiative/member data. See docs/specs/2026-06-12-spotlight-impacto-showcase-design.md
match /showcase/{id} {
  allow read: if true;
  allow write: if false;
}
```

- [ ] **Step 4: Run to verify pass**

Run: same as Step 2 command.
Expected: PASS (all showcase tests green; existing suite unaffected).

- [ ] **Step 5: Commit**

```bash
git add firestore.rules tests/firestore-rules/rules.test.ts
git commit -m "feat(rules): public-read showcase collection, beacon-only write"
```

---

## Task 5: Spotlight Firebase wiring + read layer

Add Firebase to the static site (read-only) and a Timestamp-safe snapshot mapper.

**Files:**
- Modify: `apps/spotlight/package.json` (deps)
- Create: `apps/spotlight/src/showcase/showcase-firestore.ts`
- Create: `apps/spotlight/src/showcase/use-showcase.ts`
- Test: `apps/spotlight/src/showcase/showcase-firestore.test.ts`

- [ ] **Step 1: Add deps**

Add to `apps/spotlight/package.json` `dependencies`:
```json
"@luminova/firebase": "workspace:*",
"@luminova/types": "workspace:*",
```
Run: `pnpm install`
Expected: workspace links resolve, no version fetch (workspace protocol).

> `firebase` itself is a transitive dep of `@luminova/firebase`; no direct add. If
> the bundler needs it directly, add `firebase` at the SAME pinned exact version as
> the other apps (copy from `apps/backstage/package.json`) — never type from memory.

- [ ] **Step 2: Write failing mapper test**

```ts
// apps/spotlight/src/showcase/showcase-firestore.test.ts
import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import { sortByCompletedDesc } from "./showcase-firestore.js";
import type { ShowcaseItem } from "@luminova/types/engine";

const item = (id: string, ms: number) =>
  ({ id, completedAt: Timestamp.fromMillis(ms) } as ShowcaseItem);

describe("sortByCompletedDesc", () => {
  it("orders newest completedAt first", () => {
    const out = sortByCompletedDesc([item("a", 100), item("c", 300), item("b", 200)]);
    expect(out.map((i) => i.id)).toEqual(["c", "b", "a"]);
  });
});
```

- [ ] **Step 3: Run to verify fail**

Run: `pnpm --filter spotlight test -- showcase-firestore`
Expected: FAIL (no export).

- [ ] **Step 4: Implement the read layer**

```ts
// apps/spotlight/src/showcase/showcase-firestore.ts
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { getFirebase } from "@luminova/firebase";
import type { ShowcaseItem } from "@luminova/types/engine";

export function sortByCompletedDesc(items: ShowcaseItem[]): ShowcaseItem[] {
  return [...items].sort((a, b) => b.completedAt.toMillis() - a.completedAt.toMillis());
}

export async function fetchShowcaseList(): Promise<ShowcaseItem[]> {
  const { db } = getFirebase();
  const snap = await getDocs(collection(db, "showcase"));
  const items = snap.docs.map((d) => d.data() as ShowcaseItem);
  return sortByCompletedDesc(items);
}

export async function fetchShowcaseItem(id: string): Promise<ShowcaseItem | null> {
  const { db } = getFirebase();
  const snap = await getDoc(doc(db, "showcase", id));
  return snap.exists() ? (snap.data() as ShowcaseItem) : null;
}
```

```ts
// apps/spotlight/src/showcase/use-showcase.ts
import { useEffect, useState } from "react";
import type { ShowcaseItem } from "@luminova/types/engine";
import { fetchShowcaseItem, fetchShowcaseList } from "./showcase-firestore.js";

type Async<T> = { data: T; loading: boolean; error: boolean };

export function useShowcaseList(): Async<ShowcaseItem[]> {
  const [state, setState] = useState<Async<ShowcaseItem[]>>({ data: [], loading: true, error: false });
  useEffect(() => {
    let alive = true;
    fetchShowcaseList()
      .then((data) => alive && setState({ data, loading: false, error: false }))
      .catch(() => alive && setState({ data: [], loading: false, error: true }));
    return () => { alive = false; };
  }, []);
  return state;
}

export function useShowcaseItem(id: string): Async<ShowcaseItem | null> {
  const [state, setState] = useState<Async<ShowcaseItem | null>>({ data: null, loading: true, error: false });
  useEffect(() => {
    let alive = true;
    setState({ data: null, loading: true, error: false });
    fetchShowcaseItem(id)
      .then((data) => alive && setState({ data, loading: false, error: false }))
      .catch(() => alive && setState({ data: null, loading: false, error: true }));
    return () => { alive = false; };
  }, [id]);
  return state;
}
```

- [ ] **Step 5: Run to verify pass + typecheck**

Run: `pnpm --filter spotlight test -- showcase-firestore && pnpm --filter spotlight typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/spotlight/package.json apps/spotlight/src/showcase/ pnpm-lock.yaml
git commit -m "feat(spotlight): firebase read layer for showcase collection"
```

---

## Task 6: `/impacto` index — grid, área filter, states (DESIGN PASS)

This task is the heaviest UI work. **Invoke `frontend-design` then `ui-ux-pro-max`**
to produce the aesthetic direction and validate palette/typography/a11y before/while
writing the JSX. Match the existing spotlight brand: JCI teal/blue/navy, `t-display`/
`t-title`/`t-body` scale, `.section`/`.container` layout, área framing from
`routes/index.tsx` (`AREAS`), `Reveal`/`SectionHeader`/`RippleBackground` primitives,
and `AREA_OF_OPPORTUNITY_LABELS` for área names.

**Files:**
- Create: `apps/spotlight/src/components/showcase/showcase-card.tsx`
- Create: `apps/spotlight/src/components/showcase/showcase-grid.tsx`
- Create: `apps/spotlight/src/components/showcase/area-filter.tsx`
- Create: `apps/spotlight/src/routes/impacto.index.tsx`
- Test: `apps/spotlight/src/components/showcase/showcase-grid.test.tsx`

- [ ] **Step 1: Failing test for grid order + área filter + empty state**

```tsx
// showcase-grid.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Timestamp } from "firebase/firestore";
import { ShowcaseGrid } from "./showcase-grid.js";
import type { ShowcaseItem } from "@luminova/types/engine";

const mk = (id: string, ms: number, category: ShowcaseItem["category"]): ShowcaseItem =>
  ({
    id, kind: "Project", title: `T-${id}`, description: "d", category,
    startDate: Timestamp.fromMillis(0), endDate: Timestamp.fromMillis(0),
    completedAt: Timestamp.fromMillis(ms),
    impact: { personsImpacted: 10, volunteers: 2, custom: [], closingSummary: "s" },
    photos: [], team: { director: null, coDirectors: [], members: [] },
  });

describe("ShowcaseGrid", () => {
  it("renders empty state when no items", () => {
    render(<ShowcaseGrid items={[]} />);
    expect(screen.getByText(/pronto|aún no|próximamente/i)).toBeInTheDocument();
  });
  it("renders a card per item", () => {
    render(<ShowcaseGrid items={[mk("a", 1, "DesarrolloIndividual"), mk("b", 2, "DesarrolloComunitario")]} />);
    expect(screen.getByText("T-a")).toBeInTheDocument();
    expect(screen.getByText("T-b")).toBeInTheDocument();
  });
});
```
> Verify spotlight's test setup includes jsdom + `@testing-library/react`. If absent,
> mirror backstage's vitest config (`environment: "jsdom"`, setup file) — add the
> minimal devDeps via `secure-dep-vetting` (copy exact versions from backstage).

- [ ] **Step 2: Run to verify fail** — `pnpm --filter spotlight test -- showcase-grid` → FAIL.

- [ ] **Step 3: Implement card, grid, área filter, route**

- `ShowcaseCard` props: `{ item: ShowcaseItem }` — cover image (`item.photos[0]?.url`, graceful placeholder when none, e.g. reuse `ImgSlot`/`RippleSVG` like `cards.tsx`), área badge (`AREA_OF_OPPORTUNITY_LABELS[item.category]`), title, an impact teaser (`item.impact.personsImpacted` formatted `es-BO`), links to `/impacto/$id` via router `Link`.
- `ShowcaseGrid` props: `{ items: ShowcaseItem[] }` — internal `useState` área filter, renders `AreaFilter` chips (4 áreas + "Todas") + the filtered grid; empty state copy when `items.length === 0` (graceful marketing line). Use `.section`/`.container`/grid classes.
- `AreaFilter` props: `{ value: AreaOfOpportunity | null; onChange; counts? }`.
- `impacto.index.tsx`: `createFileRoute("/impacto")`, calls `useShowcaseList()`, renders a hero `SectionHeader` ("Impacto", subtitle), loading skeletons, then `<ShowcaseGrid items={data} />`. Error state → friendly fallback.

Run frontend-design / ui-ux-pro-max here for the actual visual treatment.

- [ ] **Step 4: Run to verify pass** — `pnpm --filter spotlight test -- showcase-grid` → PASS.

- [ ] **Step 5: Lint + typecheck** — `pnpm --filter spotlight lint && pnpm --filter spotlight typecheck` → PASS. (Note: routeTree.gen.ts regenerates on `vite build`/dev — run `pnpm --filter spotlight build` if the route isn't picked up.)

- [ ] **Step 6: Commit**

```bash
git add apps/spotlight/src/components/showcase/ apps/spotlight/src/routes/impacto.index.tsx apps/spotlight/src/routeTree.gen.ts
git commit -m "feat(spotlight): /impacto showcase grid with area filter"
```

---

## Task 7: `/impacto/$id` detail (DESIGN PASS)

**Files:**
- Create: `apps/spotlight/src/components/showcase/impact-band.tsx`
- Create: `apps/spotlight/src/components/showcase/photo-gallery.tsx`
- Create: `apps/spotlight/src/components/showcase/team-credits.tsx`
- Create: `apps/spotlight/src/routes/impacto.$id.tsx`
- Test: `apps/spotlight/src/components/showcase/impact-band.test.tsx`, `team-credits.test.tsx`

- [ ] **Step 1: Failing tests**

```tsx
// impact-band.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ImpactBand } from "./impact-band.js";

describe("ImpactBand", () => {
  it("shows persons + volunteers + custom metrics", () => {
    render(<ImpactBand impact={{ personsImpacted: 1200, volunteers: 30, custom: [{ label: "Juguetes", value: "1.200" }], closingSummary: "ok" }} />);
    expect(screen.getByText(/1.200|1,200/)).toBeInTheDocument();
    expect(screen.getByText("Juguetes")).toBeInTheDocument();
  });
});
```
```tsx
// team-credits.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TeamCredits } from "./team-credits.js";

describe("TeamCredits", () => {
  it("renders director + co-directors + members by name", () => {
    render(<TeamCredits team={{ director: { name: "Ana" }, coDirectors: [{ name: "Beto" }], members: [{ name: "Caro" }] }} />);
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("Beto")).toBeInTheDocument();
    expect(screen.getByText("Caro")).toBeInTheDocument();
  });
  it("omits director block when null", () => {
    render(<TeamCredits team={{ director: null, coDirectors: [], members: [] }} />);
    expect(screen.queryByText(/director/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify fail** — `pnpm --filter spotlight test -- "impact-band|team-credits"` → FAIL.

- [ ] **Step 3: Implement components + route**

- `ImpactBand` props `{ impact: InitiativeImpact }` — stat tiles (personsImpacted, volunteers) + custom `{label,value}` pairs, `es-BO` number formatting (reuse the `ImpactStat` look from `index.tsx`).
- `PhotoGallery` props `{ photos: Photo[]; title?: string }` — responsive image grid, cover-first, captions, lightbox optional (YAGNI: start with a grid + `loading="lazy"`, alt = caption ?? title). Decide here whether to promote to `@luminova/ui` (only if it transfers cleanly; otherwise keep local).
- `TeamCredits` props `{ team: ShowcaseTeam }` — director (labeled), co-directores, equipo; omit empty blocks.
- `impacto.$id.tsx`: `createFileRoute("/impacto/$id")`, `useShowcaseItem(id)`; loading skeleton; not-found state when `!loading && data === null` (reuse `not-found.tsx` styling). Layout: hero (cover, título, área badge, date range `es-BO`), `ImpactBand`, closing-summary prose, `PhotoGallery`, `TeamCredits`, back-link to `/impacto`.

Run frontend-design / ui-ux-pro-max for visual treatment + contrast/a11y validation.

- [ ] **Step 4: Run to verify pass** — `pnpm --filter spotlight test -- "impact-band|team-credits"` → PASS.

- [ ] **Step 5: Lint + typecheck + build** — `pnpm --filter spotlight lint && pnpm --filter spotlight build` → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/spotlight/src/components/showcase/ apps/spotlight/src/routes/impacto.\$id.tsx apps/spotlight/src/routeTree.gen.ts
git commit -m "feat(spotlight): /impacto/:id detail with impact band, gallery, team credits"
```

---

## Task 8: Nav wiring

**Files:**
- Modify: `apps/spotlight/src/components/header.tsx`
- Modify: `apps/spotlight/src/routes/index.tsx`

- [ ] **Step 1: Add "Impacto" header link**

In `header.tsx`, add a nav `Link` to `/impacto` labeled "Impacto", matching the
existing nav-item styling (read the file; follow the existing pattern for `/about`,
`/contact`).

- [ ] **Step 2: Point the home flagship link to /impacto**

In `routes/index.tsx` `HomePrograms`, change `<ArrowLink href="#">Ver todos los
programas</ArrowLink>` to navigate to `/impacto` (use router `Link`/`navigate`, not a
bare `href="#"`). Keep the hardcoded flagship `PROGRAMS` content unchanged.

- [ ] **Step 3: Lint + typecheck + build** — `pnpm --filter spotlight lint && pnpm --filter spotlight build` → PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/spotlight/src/components/header.tsx apps/spotlight/src/routes/index.tsx
git commit -m "feat(spotlight): wire Impacto into header nav + home link"
```

---

## Task 9: Gauntlet + review (pre-PR)

- [ ] **Step 1: Format** — `pnpm format` (check) then `pnpm format:fix` if dirty; re-stage.
- [ ] **Step 2: Full CI serialized** — free ports: `lsof -ti tcp:4010 | xargs kill 2>/dev/null; true` — then `turbo run ci --concurrency=1`. Expected: all packages green (the rules suites race under parallel turbo; serialize).
- [ ] **Step 3: `/security-review`** on the diff (rules + new public read surface + beacon trigger).
- [ ] **Step 4: `firestore-security-reviewer`** subagent (touched `firestore.rules` + a new public collection) and **`firebase-functions-reviewer`** (touched `apps/beacon`).
- [ ] **Step 5: `bundle-budget-watcher`** (spotlight gained `@luminova/firebase` — confirm firebase is tree-shaken / code-split acceptably for a public site).
- [ ] **Step 6: `/simplify`** on the diff.
- [ ] **Step 7: `/code-review high`** on the diff; address findings.
- [ ] **Step 8: Rebase on origin/main**, then `gh pr create` to `main` with the CLAUDE.md body template (Summary + Test plan). Run `pnpm pr-tests` after opening.

---

## Self-Review notes (plan vs spec)

- **Spec coverage:** projection collection (T1–T3), rules (T4), spotlight read (T5), index+filter+empty (T6), detail+gallery+team+not-found (T7), nav (T8), reviews (T9). ✔
- **Photo public access:** no storage.rules task — by design (tokenized urls). ✔ (Spec §6.)
- **Type consistency:** `ShowcaseItem`/`ShowcaseTeam`/`ShowcasePerson` defined T1, consumed identically T2/T5/T6/T7. Mapper `projectInitiative` + `rosterMemberIds` names match T2↔T3 usage. ✔
- **Deferred (spec):** activity-photo roll-up, pagination/search — not in any task. ✔
- **Risk flagged:** spotlight may lack jsdom test infra (T6 Step 1 note) and may need a direct `firebase` dep for bundling (T5 Step 1 note) — both resolved via `secure-dep-vetting` with exact versions copied from backstage, never typed from memory.
```
