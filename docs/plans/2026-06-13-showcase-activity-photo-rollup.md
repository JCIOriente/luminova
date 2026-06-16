# Showcase activity-photo roll-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface executed child-activity photos in the public `/impacto` showcase gallery, kept fresh by a new activity-write trigger.

**Architecture:** Two pure helpers in `apps/beacon/src/showcase/project-initiative.ts` (`activityShowcasePhotos`, `activityParentRefs`) carry all the logic and get full unit tests. `projectShowcase` (impure glue in `index.ts`) gains one `activities`-by-`parentId` query and appends the rolled-up photos to `ShowcaseItem.photos`. A new `onActivityWritten` trigger re-projects the parent initiative on every activity write, re-projecting both parents when an activity moves between them.

**Tech Stack:** Firebase Cloud Functions (firebase-admin, `onDocumentWritten`), TypeScript strict, NodeNext ESM (explicit `.js` import extensions), Vitest.

**Spec:** `docs/specs/2026-06-13-showcase-activity-photo-rollup-design.md`

---

## Background the engineer needs

- `apps/beacon/src/showcase/project-initiative.ts` already exports `projectInitiative`, `rosterMemberIds`, `isProjectable` and holds a **module-private** `asPhotos(v: unknown): ShowcasePhoto[]` mapper (drops id-less / url-less photos, keeps `{id, url, caption}`). The new helpers reuse `asPhotos` directly — keep it private.
- `ShowcasePhoto` = `{ id: string; url: string; caption: string | null }` (from `@luminova/types/engine`).
- `InitiativeKind` = `"Program" | "Project"` (from `@luminova/types/engine`).
- An `Activity` doc has `parentType: InitiativeKind | null`, `parentId: string | null`, `status: "Programada" | "Ejecutada" | "Cancelada"`, `photos: Photo[]`.
- `isCleanId(value: unknown): value is string` (from `../award-points/ids.js`) rejects `""`, `/`, `__` — use it to keep `parentId` safe before it lands in a `programs/${id}` path.
- Beacon convention (`apps/beacon/CLAUDE.md`): pure helpers get unit tests; trigger handlers (`index.ts`) are impure glue, exercised by emulator e2e, not units. `index.test.ts` only smoke-tests that triggers are exported.
- `where parentId == id` on `activities` is a **single-field** query — Firestore auto-indexes it. No `firestore.indexes.json` change. (The engine already queries activities this way.)
- Admin SDK bypasses Firestore rules → no `firestore.rules` / `storage.rules` change.
- Run beacon tests with: `pnpm --filter beacon run ci` (eslint → tsc → vitest). A single test file: `pnpm --filter beacon exec vitest run src/showcase/project-initiative.test.ts`.

---

## Task 1: `activityShowcasePhotos` pure helper

**Files:**
- Modify: `apps/beacon/src/showcase/project-initiative.ts`
- Test: `apps/beacon/src/showcase/project-initiative.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `apps/beacon/src/showcase/project-initiative.test.ts`. First add the import to the existing top import line so it reads:

```ts
import {
  activityShowcasePhotos,
  projectInitiative,
  rosterMemberIds,
} from "./project-initiative.js";
```

Then append this describe block at the end of the file:

```ts
describe("activityShowcasePhotos", () => {
  const activity = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    data: {
      parentType: "Project",
      status: "Ejecutada",
      photos: [
        { id: "a", url: "https://x/a?t=1", caption: "hola", uploadedAt: ts(1), uploadedBy: "m1" },
        { id: "b", url: "https://x/b?t=1", caption: null, uploadedAt: ts(1), uploadedBy: "m1" },
      ],
      ...over,
    },
  });

  it("flattens executed activity photos with namespaced ids + preserved captions", () => {
    const photos = activityShowcasePhotos("Project", [activity("act1")]);
    expect(photos).toEqual([
      { id: "act1:a", url: "https://x/a?t=1", caption: "hola" },
      { id: "act1:b", url: "https://x/b?t=1", caption: null },
    ]);
  });

  it("namespaces by activity id so two activities never collide", () => {
    const photos = activityShowcasePhotos("Project", [activity("act1"), activity("act2")]);
    expect(photos.map((p) => p.id)).toEqual(["act1:a", "act1:b", "act2:a", "act2:b"]);
  });

  it("excludes non-Ejecutada activities", () => {
    expect(activityShowcasePhotos("Project", [activity("act1", { status: "Programada" })])).toEqual(
      [],
    );
    expect(activityShowcasePhotos("Project", [activity("act1", { status: "Cancelada" })])).toEqual(
      [],
    );
  });

  it("excludes activities whose parentType differs from the projected kind", () => {
    expect(activityShowcasePhotos("Program", [activity("act1")])).toEqual([]);
  });

  it("drops activity photos missing a usable id", () => {
    const photos = activityShowcasePhotos("Project", [
      activity("act1", {
        photos: [
          { url: "https://x/noid", caption: null, uploadedAt: ts(1), uploadedBy: "m1" },
          { id: "b", url: "https://x/b", caption: null, uploadedAt: ts(1), uploadedBy: "m1" },
        ],
      }),
    ]);
    expect(photos).toEqual([{ id: "act1:b", url: "https://x/b", caption: null }]);
  });

  it("returns [] for an activity with no photos", () => {
    expect(activityShowcasePhotos("Project", [activity("act1", { photos: undefined })])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter beacon exec vitest run src/showcase/project-initiative.test.ts`
Expected: FAIL — `activityShowcasePhotos is not a function` / import error.

- [ ] **Step 3: Implement the helper**

In `apps/beacon/src/showcase/project-initiative.ts`, add the import of `isCleanId` only if not already present (it is, for `rosterMemberIds`). Add this exported function (place it directly after `asPhotos`):

```ts
/**
 * Flatten the photos of executed child activities into namespaced ShowcasePhotos.
 * Only `status === "Ejecutada"` activities whose `parentType` matches the projected
 * `kind` contribute; ids become `${activityId}:${photoId}` so flattened gallery keys
 * never collide with the initiative's own photos or across activities.
 */
export function activityShowcasePhotos(
  kind: InitiativeKind,
  docs: { id: string; data: Record<string, unknown> }[],
): ShowcasePhoto[] {
  return docs
    .filter((d) => d.data.parentType === kind && d.data.status === "Ejecutada")
    .flatMap((d) => asPhotos(d.data.photos).map((p) => ({ ...p, id: `${d.id}:${p.id}` })));
}
```

`InitiativeKind`, `ShowcasePhoto` are already imported at the top of the file. Confirm both are in the existing `import { ... } from "@luminova/types/engine"` block; they are.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter beacon exec vitest run src/showcase/project-initiative.test.ts`
Expected: PASS (all `projectInitiative`, `rosterMemberIds`, and 6 new `activityShowcasePhotos` cases).

- [ ] **Step 5: Commit**

```bash
git add apps/beacon/src/showcase/project-initiative.ts apps/beacon/src/showcase/project-initiative.test.ts
git commit -m "feat(beacon): activityShowcasePhotos roll-up helper"
```

---

## Task 2: `activityParentRefs` pure helper

**Files:**
- Modify: `apps/beacon/src/showcase/project-initiative.ts`
- Test: `apps/beacon/src/showcase/project-initiative.test.ts`

- [ ] **Step 1: Write the failing tests**

Update the import block in the test file to add `activityParentRefs`:

```ts
import {
  activityParentRefs,
  activityShowcasePhotos,
  projectInitiative,
  rosterMemberIds,
} from "./project-initiative.js";
```

Append this describe block at the end of the test file:

```ts
describe("activityParentRefs", () => {
  it("returns the single parent for a created/updated parented activity", () => {
    expect(activityParentRefs(undefined, { parentType: "Program", parentId: "g1" })).toEqual([
      { kind: "Program", id: "g1" },
    ]);
  });

  it("returns the parent from the before-doc on delete", () => {
    expect(activityParentRefs({ parentType: "Project", parentId: "p1" }, undefined)).toEqual([
      { kind: "Project", id: "p1" },
    ]);
  });

  it("dedupes when parent is unchanged across before/after", () => {
    expect(
      activityParentRefs(
        { parentType: "Project", parentId: "p1" },
        { parentType: "Project", parentId: "p1" },
      ),
    ).toEqual([{ kind: "Project", id: "p1" }]);
  });

  it("returns both parents when an activity moves between them", () => {
    expect(
      activityParentRefs(
        { parentType: "Program", parentId: "g1" },
        { parentType: "Project", parentId: "p1" },
      ),
    ).toEqual([
      { kind: "Program", id: "g1" },
      { kind: "Project", id: "p1" },
    ]);
  });

  it("ignores standalone activities (null parent)", () => {
    expect(
      activityParentRefs({ parentType: null, parentId: null }, { parentType: null, parentId: null }),
    ).toEqual([]);
  });

  it("ignores path-unsafe or malformed parent ids", () => {
    expect(activityParentRefs(undefined, { parentType: "Program", parentId: "a/b" })).toEqual([]);
    expect(activityParentRefs(undefined, { parentType: "Bogus", parentId: "g1" })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter beacon exec vitest run src/showcase/project-initiative.test.ts`
Expected: FAIL — `activityParentRefs is not a function`.

- [ ] **Step 3: Implement the helper**

In `apps/beacon/src/showcase/project-initiative.ts`, add this exported interface + function after `activityShowcasePhotos`:

```ts
export interface ShowcaseParentRef {
  kind: InitiativeKind;
  id: string;
}

/**
 * Distinct, path-safe parent initiatives to re-project for an activity write.
 * Looks at both the before- and after-doc so a delete reconciles the old parent and
 * a parent-change re-projects both the source and destination.
 */
export function activityParentRefs(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): ShowcaseParentRef[] {
  const refs: ShowcaseParentRef[] = [];
  const seen = new Set<string>();
  for (const data of [before, after]) {
    if (!data) continue;
    const kind = data.parentType;
    const id = data.parentId;
    if ((kind !== "Program" && kind !== "Project") || !isCleanId(id)) continue;
    const key = `${kind}/${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ kind, id });
  }
  return refs;
}
```

`isCleanId` is already imported at the top of the file (used by `rosterMemberIds`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter beacon exec vitest run src/showcase/project-initiative.test.ts`
Expected: PASS (all prior cases + 6 new `activityParentRefs` cases).

- [ ] **Step 5: Commit**

```bash
git add apps/beacon/src/showcase/project-initiative.ts apps/beacon/src/showcase/project-initiative.test.ts
git commit -m "feat(beacon): activityParentRefs trigger-resolution helper"
```

---

## Task 3: Append rolled-up photos in `projectShowcase`

**Files:**
- Modify: `apps/beacon/src/index.ts` (the `projectShowcase` function, lines ~48-63, and the import block lines ~12-16)

No new unit test — `projectShowcase` is impure glue (per beacon convention). Correctness of the appended photos is covered by Task 1's unit tests and the manual emulator verification in Task 5. The change must typecheck + lint clean.

- [ ] **Step 1: Add `activityShowcasePhotos` to the showcase import**

Change the existing import block in `apps/beacon/src/index.ts`:

```ts
import {
  activityShowcasePhotos,
  isProjectable,
  projectInitiative,
  rosterMemberIds,
} from "./showcase/project-initiative.js";
```

- [ ] **Step 2: Rewrite `projectShowcase` to query activities and append**

Replace the body of `projectShowcase` (currently the `if (item) await ref.set(item); else await ref.delete();` tail) with an early-return + activities roll-up:

```ts
async function projectShowcase(
  database: Firestore,
  kind: "Program" | "Project",
  id: string,
  data: Record<string, unknown> | undefined,
): Promise<void> {
  const ref = database.doc(`showcase/${id}`);
  if (!data || !isProjectable(data)) {
    await ref.delete();
    return;
  }
  const names = await resolveMemberNames(database, rosterMemberIds(data));
  const item = projectInitiative(kind, id, data, (mid) => names.get(mid) ?? null);
  if (!item) {
    await ref.delete();
    return;
  }
  const activitySnap = await database.collection("activities").where("parentId", "==", id).get();
  const activityPhotos = activityShowcasePhotos(
    kind,
    activitySnap.docs.map((d) => ({ id: d.id, data: d.data() })),
  );
  item.photos = [...item.photos, ...activityPhotos];
  await ref.set(item);
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm --filter beacon run lint && pnpm --filter beacon exec tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/beacon/src/index.ts
git commit -m "feat(beacon): roll executed activity photos into projectShowcase"
```

---

## Task 4: `onActivityWritten` trigger

**Files:**
- Modify: `apps/beacon/src/index.ts` (add trigger + import `activityParentRefs`)
- Test: `apps/beacon/src/index.test.ts` (export smoke test)

- [ ] **Step 1: Write the failing export smoke test**

In `apps/beacon/src/index.test.ts`, add `onActivityWritten` to the import and add an assertion:

```ts
import {
  awardPoints,
  onActivityWritten,
  onMemberWritten,
  onProgramWritten,
  onProjectWritten,
  setUserRoles,
} from "./index";
```

Add inside the `describe("beacon exports", ...)` block:

```ts
  it("exports the onActivityWritten trigger", () => {
    expect(onActivityWritten).toBeDefined();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter beacon exec vitest run src/index.test.ts`
Expected: FAIL — `onActivityWritten` is `undefined` (not exported yet).

- [ ] **Step 3: Add `activityParentRefs` to the showcase import**

Update the showcase import block in `apps/beacon/src/index.ts` to include `activityParentRefs`:

```ts
import {
  activityParentRefs,
  activityShowcasePhotos,
  isProjectable,
  projectInitiative,
  rosterMemberIds,
} from "./showcase/project-initiative.js";
```

- [ ] **Step 4: Add the trigger**

In `apps/beacon/src/index.ts`, add directly after `export const onProjectWritten = initiativeTrigger("projects");`:

```ts
export const onActivityWritten = onDocumentWritten("activities/{id}", async (event) => {
  const database = db();
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  for (const parent of activityParentRefs(before, after)) {
    const collection = parent.kind === "Program" ? "programs" : "projects";
    try {
      const snap = await database.doc(`${collection}/${parent.id}`).get();
      await projectShowcase(
        database,
        parent.kind,
        parent.id,
        snap.exists ? (snap.data() as Record<string, unknown>) : undefined,
      );
    } catch (err) {
      console.error("showcase projection failed", { id: parent.id, err });
    }
  }
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter beacon exec vitest run src/index.test.ts`
Expected: PASS — all 6 export assertions.

- [ ] **Step 6: Commit**

```bash
git add apps/beacon/src/index.ts apps/beacon/src/index.test.ts
git commit -m "feat(beacon): onActivityWritten re-projects parent showcase"
```

---

## Task 5: Full beacon CI + manual emulator verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full beacon CI gate**

Run: `pnpm --filter beacon run ci`
Expected: eslint clean, `tsc --noEmit` clean, vitest all green (Task 1 + 2 + 4 suites).

- [ ] **Step 2: Build the functions bundle (catches esbuild/NodeNext drift)**

Run: `pnpm --filter beacon run build`
Expected: bundle builds with no errors.

- [ ] **Step 3: Manual emulator verification (record on the PR)**

Start emulators + seed (the seed provisions a Finalizado program), then:

```bash
firebase emulators:start   # in one shell
pnpm seed:emulator         # in another
```

Verify in the Emulator UI / spotlight:
1. Add an `Ejecutada` activity with `parentType`/`parentId` pointing at the seeded Finalizado program, attach a photo → `showcase/{programId}.photos` gains the namespaced `${activityId}:${photoId}` entry; `/impacto/$id` gallery shows it (cover unchanged).
2. Flip that activity to `Cancelada` → its photos drop from the showcase doc.
3. Delete the activity → its photos drop from the showcase doc.
4. A standalone activity (`parentId == null`) write → no showcase write, no error in functions logs.
5. Move the activity to a different Finalizado parent → photos leave the old showcase doc and appear on the new one.

Note: this is the standing C4 pre-prod manual-checklist item — record the result on the PR before merge.

- [ ] **Step 4: Commit (only if any fix was needed)**

If verification surfaced a fix, commit it with a `fix(beacon):` message. Otherwise nothing to commit — proceed to the review gauntlet.

---

## Self-review notes

- **Spec coverage:** flatten append (Task 3) ✓; Ejecutada-only + all-photos + id-namespacing (Task 1) ✓; `onActivityWritten` every-write + parent-change both-parents + standalone no-op + delete cleanup (Task 2 helper + Task 4 trigger) ✓; no type/rules/spotlight change ✓ (none touched).
- **Type consistency:** `activityShowcasePhotos(kind, docs)` and `activityParentRefs(before, after)` signatures match between their definitions (Tasks 1/2) and call sites (Tasks 3/4). `ShowcaseParentRef` shape `{kind, id}` consumed identically in the trigger. `projectShowcase` signature unchanged — only its body grows.
- **No placeholders:** every step ships real code/commands.
