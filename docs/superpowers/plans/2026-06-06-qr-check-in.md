# A3 — QR Attendance Check-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A logged-in Admin/ProjectManager scans a member's personal QR (or taps a manual fallback) on a mobile-first page → writes a `checkIns/{id}` doc → A2's `awardPoints` (unchanged) derives points. Live roster + thin Activity create/picker.

**Architecture:** Promote `CheckIn` to `@luminova/types/engine` (shared contract) + add `checkInSchema`. Generic `QrCode`/`QrScanner` in `@luminova/ui`. Backstage gains an `activities` feature (thin create + picker) and a `check-in` feature (scanner page). A5 profile shows the member's QR. `firestore.rules` gains an `activities` collection. Repos follow the project pattern (no repo-level unit tests; pure helpers + schemas + components are tested; repos exercised via emulator e2e).

**Tech Stack:** React 19, TanStack Router/Query, RHF + Zod, Firebase web SDK, `qrcode.react` (encode), `@zxing/browser` + `@zxing/library` (camera decode), vitest + RTL.

**Deps:** already added in `packages/ui` (committed). No new deps in this plan.

**Branch:** `feat/qr-check-in` (already created).

**Gotcha (every new route):** `createFileRoute("/_app/<x>")` fails `tsc` until `routeTree.gen.ts` is regenerated. After adding a route file run `pnpm --filter backstage exec vite build` once (the router plugin regenerates the tree), then the full build/ci.

---

## Task 1: Promote `CheckIn` type + add `checkInSchema` to `@luminova/types`

**Files:**
- Create: `packages/types/src/engine/check-in.ts`
- Create: `packages/types/src/engine/check-in-schema.ts`
- Create: `packages/types/src/engine/check-in-schema.test.ts`
- Modify: `packages/types/src/engine/index.ts` (export `CheckIn` type)
- Modify: `packages/types/src/index.ts` (export `checkInSchema`)
- Modify: `apps/beacon/src/award-points/check-in.ts` (import+re-export shared `CheckIn`, drop local interface)

- [ ] **Step 1: Write the failing schema test**

`packages/types/src/engine/check-in-schema.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { checkInSchema } from "./check-in-schema";

const base = { memberId: "m-1", activityId: "a-1", role: "Attendee" as const };

describe("checkInSchema", () => {
  it("accepts a clean attendee check-in", () => {
    expect(checkInSchema.safeParse(base).success).toBe(true);
  });

  it("accepts the other participation roles", () => {
    for (const role of ["Director", "CoDirector", "Team"] as const) {
      expect(checkInSchema.safeParse({ ...base, role }).success).toBe(true);
    }
  });

  it("rejects an unknown role", () => {
    expect(checkInSchema.safeParse({ ...base, role: "Boss" }).success).toBe(false);
  });

  it("rejects ids containing path/composite separators", () => {
    expect(checkInSchema.safeParse({ ...base, memberId: "a/b" }).success).toBe(false);
    expect(checkInSchema.safeParse({ ...base, activityId: "a__b" }).success).toBe(false);
  });

  it("rejects empty ids", () => {
    expect(checkInSchema.safeParse({ ...base, memberId: "" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`checkInSchema` not found)

Run: `pnpm --filter @luminova/types exec vitest run src/engine/check-in-schema.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Create the CheckIn type**

`packages/types/src/engine/check-in.ts`:
```ts
import type { Timestamp } from "./timestamp.js";
import type { ParticipationRole } from "./participation.js";

/**
 * The Recognition Engine's input fact. A client writes one of these; A2's
 * `awardPoints` trigger derives the participation + points. Uses the SDK-neutral
 * Timestamp so both backstage (client) and beacon (admin) share one contract.
 */
export interface CheckIn {
  memberId: string;
  activityId: string;
  role: ParticipationRole;
  checkInAt: Timestamp;
}
```

- [ ] **Step 4: Create the zod schema** (client-controlled fields only — `checkInAt` is server-set)

`packages/types/src/engine/check-in-schema.ts`:
```ts
import { z } from "zod";
import { PARTICIPATION_ROLES } from "./participation.js";

/** Ids flow into a composite doc id (`activityId__memberId__role`); `/` and `__`
 *  would traverse paths or collide ids, so reject them. */
const cleanId = z
  .string()
  .min(1)
  .refine((v) => !v.includes("/") && !v.includes("__"), "Id inválido.");

/** Validates the client-controlled fields of a check-in write. `checkInAt` is
 *  set server-side (`serverTimestamp()`) and is not part of this schema. */
export const checkInSchema = z.object({
  memberId: cleanId,
  activityId: cleanId,
  role: z.enum(PARTICIPATION_ROLES),
});

export type CheckInInput = z.infer<typeof checkInSchema>;
```

- [ ] **Step 5: Wire exports**

In `packages/types/src/engine/index.ts` add (with the other engine type exports):
```ts
export type { CheckIn } from "./check-in.js";
```
In `packages/types/src/index.ts` add (with the other schema exports):
```ts
export { checkInSchema, type CheckInInput } from "./engine/check-in-schema";
```

- [ ] **Step 6: Run schema test — expect PASS**

Run: `pnpm --filter @luminova/types exec vitest run src/engine/check-in-schema.test.ts`
Expected: PASS.

- [ ] **Step 7: Repoint beacon to the shared type**

Replace the local interface in `apps/beacon/src/award-points/check-in.ts`. Change the top of the file from `export interface CheckIn { … }` (using `firebase-admin/firestore` Timestamp) to:
```ts
import { PARTICIPATION_ROLES, type ParticipationRole } from "@luminova/types/engine";
import type { CheckIn } from "@luminova/types/engine";

export type { CheckIn };
```
Keep `isTimestamp`, `isCleanId`, and `validateCheckIn` exactly as they are (they still return `CheckIn`; the admin `Timestamp` satisfies the neutral `{toMillis;toDate}` interface). Remove the now-unused `import type { Timestamp } from "firebase-admin/firestore"` only if nothing else references it — `isTimestamp` returns `value is Timestamp`, so change that guard to return `value is CheckIn["checkInAt"]`:
```ts
function isTimestamp(value: unknown): value is CheckIn["checkInAt"] {
  return typeof (value as { toMillis?: unknown })?.toMillis === "function";
}
```
`derive.ts` imports `CheckIn` from `./check-in.js` — unchanged (re-export covers it).

- [ ] **Step 8: Verify types + beacon green, engine barrel stays zod-free**

Run:
```bash
pnpm --filter @luminova/types run ci
pnpm --filter beacon run ci
node -e "import('@luminova/types/engine').then(()=>console.log('engine loads'))" 2>&1 | tail -1
```
Expected: both ci PASS; "engine loads" (no zod pulled into the pure subpath).

- [ ] **Step 9: Commit**

```bash
git add packages/types apps/beacon/src/award-points/check-in.ts
git commit -m "feat(types): promote CheckIn to @luminova/types/engine + checkInSchema"
```

---

## Task 2: `member-qr` envelope helper (backstage)

**Files:**
- Create: `apps/backstage/src/lib/member-qr.ts`
- Create: `apps/backstage/src/lib/member-qr.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/backstage/src/lib/member-qr.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { encodeMemberQr, decodeMemberQr } from "./member-qr";

describe("member-qr", () => {
  it("round-trips a member id", () => {
    expect(decodeMemberQr(encodeMemberQr("abc123"))).toBe("abc123");
  });

  it("prefixes with the JCI namespace", () => {
    expect(encodeMemberQr("abc123")).toBe("jcioriente:member:abc123");
  });

  it("rejects a foreign QR", () => {
    expect(decodeMemberQr("https://example.com")).toBeNull();
    expect(decodeMemberQr("jcioriente:ally:abc")).toBeNull();
  });

  it("rejects a missing or empty id", () => {
    expect(decodeMemberQr("jcioriente:member:")).toBeNull();
    expect(decodeMemberQr("")).toBeNull();
  });

  it("rejects an id with separators (defends the composite doc id)", () => {
    expect(decodeMemberQr("jcioriente:member:a/b")).toBeNull();
    expect(decodeMemberQr("jcioriente:member:a__b")).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** `pnpm --filter backstage exec vitest run src/lib/member-qr.test.ts`

- [ ] **Step 3: Implement**

`apps/backstage/src/lib/member-qr.ts`:
```ts
const PREFIX = "jcioriente:member:";

/** Encode a member doc id as a scannable, namespaced QR payload (no PII). */
export function encodeMemberQr(memberId: string): string {
  return `${PREFIX}${memberId}`;
}

/** Parse a scanned QR string back to a member id, or null if it isn't ours /
 *  is malformed. Rejects path/composite separators to protect the check-in id. */
export function decodeMemberQr(text: string): string | null {
  if (!text.startsWith(PREFIX)) return null;
  const id = text.slice(PREFIX.length);
  if (id.length === 0 || id.includes("/") || id.includes("__")) return null;
  return id;
}
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Commit** `git add apps/backstage/src/lib/member-qr.* && git commit -m "feat(backstage): member QR envelope encode/decode"`

---

## Task 3: `QrCode` component (`@luminova/ui`)

**Files:**
- Create: `packages/ui/src/components/qr-code.tsx`
- Create: `packages/ui/src/components/qr-code.test.tsx`
- Modify: `packages/ui/src/index.ts`

> Note: `@luminova/ui` has no DOM test runner configured for `.tsx` by default — DOM/behavior tests live in backstage's jsdom. Confirm with `grep -r jsdom packages/ui`; if absent, **skip the render test here** and instead add the smoke assertion in a backstage test (Task 11 covers the real usage). If `packages/ui/vitest` has jsdom, use the test below.

- [ ] **Step 1: Implement the component**

`packages/ui/src/components/qr-code.tsx`:
```tsx
import { QRCodeSVG } from "qrcode.react";

export interface QrCodeProps {
  value: string;
  size?: number;
  className?: string;
}

/** Renders a QR code SVG for an arbitrary string. Generic — no domain knowledge. */
export function QrCode({ value, size = 192, className }: QrCodeProps) {
  return (
    <QRCodeSVG
      value={value}
      size={size}
      level="M"
      marginSize={2}
      className={className}
      role="img"
      aria-label="Código QR"
    />
  );
}
```

- [ ] **Step 2: Export** — add to `packages/ui/src/index.ts`:
```ts
export { QrCode, type QrCodeProps } from "./components/qr-code";
```

- [ ] **Step 3: Typecheck** `pnpm --filter @luminova/ui run ci`
Expected: PASS (knip won't flag the export — Task 11 consumes it).

- [ ] **Step 4: Commit** `git add packages/ui && git commit -m "feat(ui): QrCode component (qrcode.react)"`

---

## Task 4: `QrScanner` component (`@luminova/ui`)

**Files:**
- Create: `packages/ui/src/components/qr-scanner.tsx`
- Modify: `packages/ui/src/index.ts`

Camera glue is not unit-testable in jsdom (no `getUserMedia`/decode). It is covered manually + emulator e2e. Make it defensive: report errors via `onError`, clean up the decode controls on unmount.

- [ ] **Step 1: Implement**

`packages/ui/src/components/qr-scanner.tsx`:
```tsx
import { useEffect, useRef } from "react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";

export interface QrScannerProps {
  onScan: (text: string) => void;
  onError?: (error: unknown) => void;
  className?: string;
  /** Pause decoding (e.g. while a write is in flight) without tearing down the camera. */
  paused?: boolean;
}

/** Live camera QR scanner. Decodes continuously and calls `onScan` with the raw
 *  decoded text. Generic — the caller interprets the payload. */
export function QrScanner({ onScan, onError, className, paused = false }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const reader = new BrowserQRCodeReader();
    let controls: IScannerControls | undefined;
    let cancelled = false;

    reader
      .decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result) => {
        if (result && !pausedRef.current) onScan(result.getText());
      })
      .then((c) => {
        if (cancelled) c.stop();
        else controls = c;
      })
      .catch((err) => onError?.(err));

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [onScan, onError]);

  return (
    <video
      ref={videoRef}
      className={className}
      muted
      playsInline
      aria-label="Visor de cámara para escanear códigos QR"
    />
  );
}
```

- [ ] **Step 2: Export** — add to `packages/ui/src/index.ts`:
```ts
export { QrScanner, type QrScannerProps } from "./components/qr-scanner";
```

- [ ] **Step 3: Typecheck** `pnpm --filter @luminova/ui run ci`
Expected: PASS.

- [ ] **Step 4: Commit** `git add packages/ui && git commit -m "feat(ui): QrScanner camera component (@zxing/browser)"`

---

## Task 5: Activity mapper (pure, TDD)

**Files:**
- Create: `apps/backstage/src/features/activities/repositories/activity-mapper.ts`
- Create: `apps/backstage/src/features/activities/repositories/activity-mapper.test.ts`

- [ ] **Step 1: Write the failing test**

`activity-mapper.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase/firestore";
import { toActivityCreateDoc } from "./activity-mapper";
import type { ActivityInput } from "@luminova/types";

const input: ActivityInput = {
  category: "Assembly",
  parentType: null,
  parentId: null,
  startAt: "2026-06-10T18:30",
  directorId: null,
};

describe("toActivityCreateDoc", () => {
  it("sets term, status, organizers and a Timestamp startAt", () => {
    const doc = toActivityCreateDoc(input, "2026");
    expect(doc.termId).toBe("2026");
    expect(doc.status).toBe("Programada");
    expect(doc.organizers).toEqual({ directorId: null, coDirectorId: null });
    expect(doc.startAt).toBeInstanceOf(Timestamp);
    expect(doc.parentType).toBeNull();
    expect(doc.parentId).toBeNull();
  });

  it("round-trips startAt as the exact local datetime (UTC-stable)", () => {
    const doc = toActivityCreateDoc(input, "2026");
    expect(doc.startAt.toDate().toISOString()).toBe("2026-06-10T18:30:00.000Z");
  });

  it("carries a director and parent through for a ProjectExecution", () => {
    const doc = toActivityCreateDoc(
      { category: "ProjectExecution", parentType: "Project", parentId: "p-1", startAt: "2026-06-10T18:30", directorId: "m-1" },
      "2026",
    );
    expect(doc.organizers.directorId).toBe("m-1");
    expect(doc.parentType).toBe("Project");
    expect(doc.parentId).toBe("p-1");
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** `pnpm --filter backstage exec vitest run src/features/activities/repositories/activity-mapper.test.ts`

- [ ] **Step 3: Implement**

`activity-mapper.ts`:
```ts
import { Timestamp } from "firebase/firestore";
import type { ActivityInput } from "@luminova/types";

/** `datetime-local` value ("YYYY-MM-DDTHH:mm") → Timestamp at that wall-clock in
 *  UTC, so the stored instant round-trips with the input regardless of TZ. */
function toTimestamp(value: string): Timestamp {
  return Timestamp.fromDate(new Date(`${value}:00Z`));
}

/** New activity document: form fields + term + system defaults. */
export function toActivityCreateDoc(data: ActivityInput, termId: string) {
  return {
    termId,
    category: data.category,
    parentType: data.parentType,
    parentId: data.parentId,
    organizers: { directorId: data.directorId, coDirectorId: null },
    startAt: toTimestamp(data.startAt),
    status: "Programada" as const,
  };
}
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Commit** `git add apps/backstage/src/features/activities && git commit -m "feat(backstage): activity create-doc mapper"`

---

## Task 6: Activity repository + hooks

**Files:**
- Create: `apps/backstage/src/features/activities/repositories/activity-repository.ts`
- Create: `apps/backstage/src/features/activities/hooks/activity-keys.ts`
- Create: `apps/backstage/src/features/activities/hooks/use-activities-by-term.ts`
- Create: `apps/backstage/src/features/activities/hooks/use-create-activity.ts`

(No repo unit test — project pattern; exercised in emulator e2e, Task 14.)

- [ ] **Step 1: Repository**

`activity-repository.ts`:
```ts
import { collection, doc, addDoc, getDocs, query, where } from "firebase/firestore";
import { getFirebase } from "@luminova/firebase";
import type { Activity, ActivityInput } from "@luminova/types";
import { toActivityCreateDoc } from "./activity-mapper";

export class ActivityRepository {
  private readonly db = getFirebase().db;
  private readonly collection = collection(this.db, "activities");

  /** Activities for a term, newest start first. */
  async getByTerm(termId: string): Promise<Activity[]> {
    const snapshot = await getDocs(query(this.collection, where("termId", "==", termId)));
    return snapshot.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Activity, "id">) }))
      .sort((a, b) => b.startAt.toMillis() - a.startAt.toMillis());
  }

  async create(data: ActivityInput, termId: string): Promise<string> {
    const ref = await addDoc(this.collection, toActivityCreateDoc(data, termId));
    return ref.id;
  }
}
```
(`doc` import is unused — drop it; included here only if a later getById is added. Remove to satisfy lint.)

- [ ] **Step 2: Keys + hooks**

`activity-keys.ts`:
```ts
export const activityKeys = {
  all: ["activities"] as const,
  byTerm: (termId: string) => ["activities", "term", termId] as const,
};
```
`use-activities-by-term.ts`:
```ts
import { useQuery } from "@tanstack/react-query";
import { ActivityRepository } from "../repositories/activity-repository";
import { activityKeys } from "./activity-keys";

export function useActivitiesByTerm(termId: string) {
  return useQuery({
    queryKey: activityKeys.byTerm(termId),
    queryFn: () => new ActivityRepository().getByTerm(termId),
  });
}
```
`use-create-activity.ts`:
```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ActivityRepository } from "../repositories/activity-repository";
import type { ActivityInput } from "@luminova/types";
import { activityKeys } from "./activity-keys";

export function useCreateActivity(termId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ActivityInput) => new ActivityRepository().create(data, termId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: activityKeys.byTerm(termId) }),
  });
}
```

- [ ] **Step 3: Typecheck** `pnpm --filter backstage exec tsc --noEmit` — expect PASS.

- [ ] **Step 4: Commit** `git add apps/backstage/src/features/activities && git commit -m "feat(backstage): activity repository + query hooks"`

---

## Task 7: ActivityForm + ActivityTable + `/activities` route

**Files:**
- Create: `apps/backstage/src/features/activities/components/activity-form.tsx`
- Create: `apps/backstage/src/features/activities/components/activity-form.test.tsx`
- Create: `apps/backstage/src/features/activities/components/activity-table.tsx`
- Create: `apps/backstage/src/routes/_app.activities.tsx`
- Modify: `apps/backstage/src/components/nav-config.ts` (Task 12 wires the nav; here just the route + table + form)

The category labels are Spanish. Define a local label map:
```ts
const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  Assembly: "Asamblea",
  Course: "Curso",
  Anniversary: "Aniversario",
  TM: "TM",
  NationalEvent: "Evento nacional",
  ProjectExecution: "Ejecución de proyecto",
};
```

- [ ] **Step 1: Write the failing form test**

`activity-form.test.tsx` (mirror the MemberForm test style; uses RHF + zodResolver). Asserts: renders category select + datetime input; submitting an institutional Assembly (no parent) calls `onSubmit` with `parentType:null`; selecting `ProjectExecution` without a parent surfaces the Invariant-A error and does not submit.
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ActivityForm } from "./activity-form";

describe("ActivityForm", () => {
  it("submits an institutional activity with no parent", async () => {
    const onSubmit = vi.fn();
    render(<ActivityForm onSubmit={onSubmit} isSaving={false} />);
    fireEvent.change(screen.getByLabelText("Fecha y hora"), { target: { value: "2026-06-10T18:30" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ category: "Assembly", parentType: null, parentId: null });
  });

  it("blocks a ProjectExecution with no parent (Invariant A)", async () => {
    const onSubmit = vi.fn();
    render(<ActivityForm onSubmit={onSubmit} isSaving={false} />);
    fireEvent.change(screen.getByLabelText("Categoría"), { target: { value: "ProjectExecution" } });
    fireEvent.change(screen.getByLabelText("Fecha y hora"), { target: { value: "2026-06-10T18:30" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() => expect(screen.getByText(/requiere un programa o proyecto/i)).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `ActivityForm`** — RHF + `zodResolver(activitySchema)`, fields: `category` (Select with CATEGORY_LABELS), `startAt` (`<input type="datetime-local">` via `Field` label "Fecha y hora"), `parentType` (Select: "—"/Program/Project, null when "—"), `parentId` (`Input`, optional), `directorId` (`Input`, optional). Default values: `{ category: "Assembly", parentType: null, parentId: null, startAt: "", directorId: null }`. Submit button label "Guardar". Props: `{ onSubmit: (data: ActivityInput) => void; isSaving: boolean }`. Normalize empty-string `parentId`/`directorId` to `null` before validation (RHF `setValueAs` or a resolver pre-transform). Render `parentType`/`parentId` errors from `formState.errors`.

- [ ] **Step 4: Implement `ActivityTable`** — `@luminova/ui` Table; columns: Categoría (label), Fecha (format `startAt.toDate()` `es-BO` date+time), Estado (`Badge` — Programada gray, Ejecutada green, Cancelada red). Empty handled by the route's `EmptyState`.

- [ ] **Step 5: Implement the route** `_app.activities.tsx`:
```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button, EmptyState, Icon, Sheet } from "@luminova/ui";
import { Can } from "../lib/authz/ability-context";
import { PageHeader } from "../components/page-header";
import { currentTermId } from "../lib/current-term";
import { useActivitiesByTerm } from "../features/activities/hooks/use-activities-by-term";
import { useCreateActivity } from "../features/activities/hooks/use-create-activity";
import { ActivityForm } from "../features/activities/components/activity-form";
import { ActivityTable } from "../features/activities/components/activity-table";

export const Route = createFileRoute("/_app/activities")({ component: ActivitiesPage });

function ActivitiesPage() {
  const termId = currentTermId();
  const { data: activities, isLoading, isError } = useActivitiesByTerm(termId);
  const create = useCreateActivity(termId);
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Reconocimiento"
        title="Actividades"
        actions={
          <Can I="create" a="Activity">
            <Button as="button" type="button" iconLeft={Icon.plus({ s: 18 })} onClick={() => setOpen(true)}>
              Nueva actividad
            </Button>
          </Can>
        }
      />
      {isLoading && <p className="text-ink-3">Cargando…</p>}
      {isError && <p className="text-error">No se pudieron cargar las actividades.</p>}
      {activities && activities.length === 0 && (
        <EmptyState icon={Icon.calendar({ s: 40 })} title={`No hay actividades para ${termId}.`} description="Crea una actividad para registrar asistencia." />
      )}
      {activities && activities.length > 0 && <ActivityTable activities={activities} />}
      <Sheet open={open} onClose={() => setOpen(false)} title="Nueva actividad">
        <ActivityForm
          isSaving={create.isPending}
          onSubmit={(data) => create.mutate(data, { onSuccess: () => setOpen(false) })}
        />
      </Sheet>
    </div>
  );
}
```
(If `Icon.calendar` doesn't exist, use an existing icon key — check `packages/ui/src/components/icons.tsx` and pick the nearest, e.g. `target` or add a `calendar` icon following the existing icon pattern.)

- [ ] **Step 6: Regenerate route tree, then run tests**

```bash
pnpm --filter backstage exec vite build   # regenerates routeTree.gen.ts
pnpm --filter backstage exec vitest run src/features/activities
```
Expected: form tests PASS; build succeeds.

- [ ] **Step 7: Commit** `git add apps/backstage && git commit -m "feat(backstage): /activities create form + table + route"`

---

## Task 8: Check-in roster pure helpers (TDD)

**Files:**
- Create: `apps/backstage/src/features/check-in/roster.ts`
- Create: `apps/backstage/src/features/check-in/roster.test.ts`

A `CheckInRecord` is the read shape from `checkIns` (`{ memberId, role }` plus its doc fields). Define it locally for the roster.

- [ ] **Step 1: Write the failing test**

`roster.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { alreadyCheckedIn, buildRosterEntries } from "./roster";
import type { Member } from "@luminova/types";

const members = [
  { id: "m-1", name: "Bruno Paz" },
  { id: "m-2", name: "Ana Rivas" },
] as Member[];
const checkIns = [
  { memberId: "m-2", role: "Attendee" as const },
  { memberId: "m-1", role: "Attendee" as const },
];

describe("roster", () => {
  it("detects an already-checked-in member", () => {
    expect(alreadyCheckedIn(checkIns, "m-1")).toBe(true);
    expect(alreadyCheckedIn(checkIns, "m-9")).toBe(false);
  });

  it("resolves names and sorts by name (es)", () => {
    const rows = buildRosterEntries(checkIns, members);
    expect(rows.map((r) => r.name)).toEqual(["Ana Rivas", "Bruno Paz"]);
  });

  it("falls back to the id when the member is unknown", () => {
    const rows = buildRosterEntries([{ memberId: "ghost", role: "Attendee" }], members);
    expect(rows[0].name).toBe("ghost");
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**

`roster.ts`:
```ts
import type { Member } from "@luminova/types";
import type { ParticipationRole } from "@luminova/types/engine";

export interface CheckInRecord {
  memberId: string;
  role: ParticipationRole;
}

export interface RosterEntry {
  memberId: string;
  name: string;
}

export function alreadyCheckedIn(checkIns: CheckInRecord[], memberId: string): boolean {
  return checkIns.some((c) => c.memberId === memberId);
}

export function buildRosterEntries(checkIns: CheckInRecord[], members: Member[]): RosterEntry[] {
  const nameById = new Map(members.map((m) => [m.id, m.name]));
  return checkIns
    .map((c) => ({ memberId: c.memberId, name: nameById.get(c.memberId) ?? c.memberId }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Commit** `git add apps/backstage/src/features/check-in && git commit -m "feat(backstage): check-in roster helpers"`

---

## Task 9: Check-in repository + hooks

**Files:**
- Create: `apps/backstage/src/features/check-in/repositories/check-in-repository.ts`
- Create: `apps/backstage/src/features/check-in/hooks/check-in-keys.ts`
- Create: `apps/backstage/src/features/check-in/hooks/use-activity-check-ins.ts`
- Create: `apps/backstage/src/features/check-in/hooks/use-create-check-in.ts`

- [ ] **Step 1: Repository**

`check-in-repository.ts`:
```ts
import { collection, doc, getDocs, setDoc, query, where, serverTimestamp } from "firebase/firestore";
import { getFirebase } from "@luminova/firebase";
import { checkInSchema, type CheckInInput } from "@luminova/types";
import type { CheckInRecord } from "../roster";

export class CheckInRepository {
  private readonly db = getFirebase().db;
  private readonly collection = collection(this.db, "checkIns");

  /** Roster for an activity (who has checked in). */
  async getByActivity(activityId: string): Promise<CheckInRecord[]> {
    const snapshot = await getDocs(query(this.collection, where("activityId", "==", activityId)));
    return snapshot.docs.map((d) => {
      const data = d.data() as { memberId: string; role: CheckInRecord["role"] };
      return { memberId: data.memberId, role: data.role };
    });
  }

  /** Write a check-in. Deterministic id (idempotent) + server timestamp. The
   *  repository is the authoritative validation boundary. */
  async create(input: CheckInInput): Promise<void> {
    const { memberId, activityId, role } = checkInSchema.parse(input);
    const id = `${activityId}__${memberId}__${role}`;
    await setDoc(doc(this.collection, id), {
      memberId,
      activityId,
      role,
      checkInAt: serverTimestamp(),
    });
  }
}
```

- [ ] **Step 2: Keys + hooks**

`check-in-keys.ts`:
```ts
export const checkInKeys = {
  byActivity: (activityId: string) => ["checkIns", activityId] as const,
};
```
`use-activity-check-ins.ts`:
```ts
import { useQuery } from "@tanstack/react-query";
import { CheckInRepository } from "../repositories/check-in-repository";
import { checkInKeys } from "./check-in-keys";

export function useActivityCheckIns(activityId: string | null) {
  return useQuery({
    queryKey: checkInKeys.byActivity(activityId ?? "none"),
    queryFn: () => new CheckInRepository().getByActivity(activityId as string),
    enabled: !!activityId,
  });
}
```
`use-create-check-in.ts`:
```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckInRepository } from "../repositories/check-in-repository";
import type { CheckInInput } from "@luminova/types";
import { checkInKeys } from "./check-in-keys";

export function useCreateCheckIn(activityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CheckInInput) => new CheckInRepository().create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: checkInKeys.byActivity(activityId) }),
  });
}
```

- [ ] **Step 3: Typecheck** `pnpm --filter backstage exec tsc --noEmit` — expect PASS.

- [ ] **Step 4: Commit** `git add apps/backstage/src/features/check-in && git commit -m "feat(backstage): check-in repository + hooks"`

---

## Task 10: Check-in components + `/check-in` route (mobile-first)

**Files:**
- Create: `apps/backstage/src/features/check-in/components/activity-picker.tsx`
- Create: `apps/backstage/src/features/check-in/components/roster-list.tsx`
- Create: `apps/backstage/src/features/check-in/components/manual-tap-list.tsx`
- Create: `apps/backstage/src/features/check-in/components/manual-tap-list.test.tsx`
- Create: `apps/backstage/src/routes/_app.check-in.tsx`

- [ ] **Step 1: Failing test for `ManualTapList`**

`manual-tap-list.test.tsx`: renders active members; tapping a not-checked-in member calls `onTap(memberId)`; an already-checked-in member's button is disabled.
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ManualTapList } from "./manual-tap-list";
import type { Member } from "@luminova/types";

const members = [
  { id: "m-1", name: "Ana Rivas" },
  { id: "m-2", name: "Bruno Paz" },
] as Member[];

describe("ManualTapList", () => {
  it("taps a member who hasn't checked in", () => {
    const onTap = vi.fn();
    render(<ManualTapList members={members} checkedInIds={["m-2"]} onTap={onTap} />);
    fireEvent.click(screen.getByRole("button", { name: /ana rivas/i }));
    expect(onTap).toHaveBeenCalledWith("m-1");
  });

  it("disables an already-checked-in member", () => {
    const onTap = vi.fn();
    render(<ManualTapList members={members} checkedInIds={["m-2"]} onTap={onTap} />);
    expect(screen.getByRole("button", { name: /bruno paz/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `ManualTapList`** — props `{ members: Member[]; checkedInIds: string[]; onTap: (memberId: string) => void }`. A search `Input` filtering by name (client-side); a scrollable list of `<button>` rows (name + check icon when checked in); `disabled={checkedInIds.includes(m.id)}`. Mobile-first: full-width tap targets (min-h 44px).

- [ ] **Step 4: Implement `ActivityPicker`** — props `{ activities: Activity[]; value: string | null; onChange: (id: string) => void }`. A `Select` of activities for the term (label = `CATEGORY_LABELS[category]` + formatted `startAt`). Reuse the category label map (extract to `features/activities/category-labels.ts` and import in both places to stay DRY).

- [ ] **Step 5: Implement `RosterList`** — props `{ entries: RosterEntry[] }`. A count header ("N presentes") + list of names. Empty → muted "Nadie ha registrado asistencia aún."

- [ ] **Step 6: Implement the route** `_app.check-in.tsx` — mobile-first column. Lazy-load the scanner so the camera libs stay out of the main chunk:
```tsx
import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useState } from "react";
import { QrCode } from "@luminova/ui"; // not used here; remove if unused
import { PageHeader } from "../components/page-header";
import { currentTermId } from "../lib/current-term";
import { useMembers } from "../features/members/hooks/use-members";
import { useActivitiesByTerm } from "../features/activities/hooks/use-activities-by-term";
import { useActivityCheckIns } from "../features/check-in/hooks/use-activity-check-ins";
import { useCreateCheckIn } from "../features/check-in/hooks/use-create-check-in";
import { ActivityPicker } from "../features/check-in/components/activity-picker";
import { RosterList } from "../features/check-in/components/roster-list";
import { ManualTapList } from "../features/check-in/components/manual-tap-list";
import { alreadyCheckedIn, buildRosterEntries } from "../features/check-in/roster";
import { decodeMemberQr } from "../lib/member-qr";

const LazyQrScanner = lazy(() =>
  import("@luminova/ui").then((m) => ({ default: m.QrScanner })),
);

export const Route = createFileRoute("/_app/check-in")({ component: CheckInPage });

function CheckInPage() {
  const termId = currentTermId();
  const { data: activities } = useActivitiesByTerm(termId);
  const { data: members } = useMembers();
  const [activityId, setActivityId] = useState<string | null>(null);
  const { data: checkIns } = useActivityCheckIns(activityId);
  const create = useCreateCheckIn(activityId ?? "none");

  const roster = useMemo(
    () => buildRosterEntries(checkIns ?? [], members ?? []),
    [checkIns, members],
  );
  const checkedInIds = (checkIns ?? []).map((c) => c.memberId);

  const checkIn = (memberId: string) => {
    if (!activityId) return;
    if (alreadyCheckedIn(checkIns ?? [], memberId)) return; // idempotent: skip re-write
    create.mutate({ memberId, activityId, role: "Attendee" });
  };

  const onScan = (text: string) => {
    const memberId = decodeMemberQr(text);
    if (memberId) checkIn(memberId);
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      <PageHeader eyebrow="Reconocimiento" title="Check-in" />
      <ActivityPicker activities={activities ?? []} value={activityId} onChange={setActivityId} />
      {activityId && (
        <>
          <Suspense fallback={<p className="text-ink-3">Cargando cámara…</p>}>
            <LazyQrScanner
              onScan={onScan}
              paused={create.isPending}
              className="aspect-square w-full rounded-[14px] bg-ink-1/5 object-cover"
            />
          </Suspense>
          <RosterList entries={roster} />
          <ManualTapList members={members ?? []} checkedInIds={checkedInIds} onTap={checkIn} />
        </>
      )}
    </div>
  );
}
```
(Remove the unused `QrCode` import — left as a reminder it lives in the same package. Verify `Suspense`/`lazy` chunking works with the dynamic `import("@luminova/ui")`; since ui is raw source, the dynamic import still produces a separate chunk for the zxing code path.)

- [ ] **Step 7: Regenerate route tree + run tests**
```bash
pnpm --filter backstage exec vite build
pnpm --filter backstage exec vitest run src/features/check-in
```
Expected: ManualTapList tests PASS; build succeeds.

- [ ] **Step 8: Commit** `git add apps/backstage && git commit -m "feat(backstage): /check-in scanner page (camera + roster + manual tap)"`

---

## Task 11: A5 profile — member QR panel

**Files:**
- Modify: `apps/backstage/src/routes/_app.members_.$memberId.tsx`

- [ ] **Step 1: Add the QR panel.** Import `QrCode` and `encodeMemberQr`:
```tsx
import { Badge, Sparkline, QrCode, type BadgeTone } from "@luminova/ui";
import { encodeMemberQr } from "../lib/member-qr";
```
After the points/months card, add a panel:
```tsx
<div className="flex w-fit flex-col items-center gap-3 rounded-[14px] border border-line bg-surface px-6 py-5">
  <QrCode value={encodeMemberQr(member.id)} size={176} />
  <p className="text-[12px] text-ink-3">QR personal · escanéalo en el check-in</p>
</div>
```

- [ ] **Step 2: Typecheck + existing member tests**
```bash
pnpm --filter backstage exec tsc --noEmit
pnpm --filter backstage exec vitest run src/features/members
```
Expected: PASS.

- [ ] **Step 3: Commit** `git add apps/backstage && git commit -m "feat(backstage): show member personal QR on profile (A5)"`

---

## Task 12: Nav + ability — surface Activities & Check-in to Admin/PM

**Files:**
- Modify: `packages/auth/src/ability.ts`
- Modify: `packages/auth/src/ability.test.ts` (add cases)
- Modify: `apps/backstage/src/components/nav-config.ts`
- Modify: `apps/backstage/src/components/nav-config.test.ts`
- Modify: `apps/backstage/src/components/app-sidebar.tsx` (honor `action`)

- [ ] **Step 1: Failing ability test** — add to `packages/auth/src/ability.test.ts`:
```ts
it("lets a ProjectManager manage activities and check in", () => {
  const a = buildAbility({ roles: ["ProjectManager"] }, "u1");
  expect(a.can("create", "Activity")).toBe(true);
  expect(a.can("read", "Activity")).toBe(true);
  expect(a.can("checkIn", "Attendance")).toBe(true);
});
it("does not grant a plain Member activity management", () => {
  const a = buildAbility({ roles: ["Member"] }, "u1");
  expect(a.can("create", "Activity")).toBe(false);
});
```

- [ ] **Step 2: Run — expect FAIL.** `pnpm --filter @luminova/auth exec vitest run src/ability.test.ts`

- [ ] **Step 3: Extend `applyRole` for ProjectManager** in `ability.ts`:
```ts
    case "ProjectManager":
      can("manage", ["Project", "Activity"]);
      can("checkIn", "Attendance");
      can("read", ["Ally", "Event"]);
      break;
```

- [ ] **Step 4: Run ability test — expect PASS.** `pnpm --filter @luminova/auth run ci`

- [ ] **Step 5: Extend `nav-config.ts`** — widen `to`, `subject`, add optional `action`:
```ts
import type { Action, Subject } from "@luminova/auth/ability"; // if exported; else inline the unions
// ...
export interface NavItem {
  to: "/" | "/members" | "/allies" | "/point-rules" | "/leaderboard" | "/activities" | "/check-in";
  label: string;
  icon: IconKey;
  exact?: boolean;
  subject?: "Member" | "Ally" | "PointRule" | "Activity" | "Attendance";
  action?: "read" | "checkIn";
}
```
Add to the "Gestión" group (or a new "Reconocimiento" group — pick "Gestión" to match point-rules):
```ts
{ to: "/activities", label: "Actividades", icon: "calendar", subject: "Activity" },
{ to: "/check-in", label: "Check-in", icon: "qr", subject: "Attendance", action: "checkIn" },
```
(Use existing icon keys; add `calendar`/`qr` icons to `packages/ui/src/components/icons.tsx` following the existing pattern if absent, and export — they're consumed here so knip is satisfied.)

- [ ] **Step 6: Honor `action` in the sidebar** — in `app-sidebar.tsx` change the filter:
```ts
items: group.items.filter((item) => !item.subject || ability.can(item.action ?? "read", item.subject)),
```

- [ ] **Step 7: Update `nav-config.test.ts`** — add assertions that `/activities` (subject Activity) and `/check-in` (subject Attendance, action checkIn) exist with the expected gating fields. Follow the existing test's shape.

- [ ] **Step 8: Run** `pnpm --filter @luminova/auth run ci && pnpm --filter backstage exec vitest run src/components` — expect PASS.

- [ ] **Step 9: Commit** `git add packages/auth apps/backstage && git commit -m "feat: gate Activities + Check-in nav to Admin/ProjectManager"`

---

## Task 13: `firestore.rules` — `activities` collection + tests

**Files:**
- Modify: `firestore.rules`
- Modify: `tests/firestore-rules/rules.test.ts`

- [ ] **Step 1: Add failing rules tests** — in `rules.test.ts`, mirror the existing per-collection blocks. Assert: an Admin can create an activity; a ProjectManager can create + update; a plain Member cannot create; any signed-in user can read; nobody can delete. (Use the existing test helpers for authed contexts.)

- [ ] **Step 2: Add the `activities` match** to `firestore.rules`, before the catch-all:
```
    match /activities/{activityId} {
      allow read: if signedIn();
      allow create, update: if hasAnyRole(['Admin', 'ProjectManager']);
      allow delete: if false;
    }
```

- [ ] **Step 3: Run rules tests** (Java required — non-interactive shell needs the PATH prefix):
```bash
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"; export JAVA_HOME="/opt/homebrew/opt/openjdk"
pnpm --filter firestore-rules run test:run
```
Expected: PASS (new activities cases + existing checkIns/members/etc still green). If an emulator is already up on :4010 the suite reuses it (`env.clearFirestore()` in beforeAll handles residue).

- [ ] **Step 4: Commit** `git add firestore.rules tests/firestore-rules && git commit -m "feat(rules): activities collection (Admin/PM write, signed-in read, no delete)"`

---

## Task 14: Verification + reviews + emulator e2e

- [ ] **Step 1: Full gate** — `pnpm pr-tests` (format + all ci + knip). Fix any knip unused-export flags (every new `@luminova/ui`/icon export must be consumed). If Java is needed for rules, prefix PATH as above.

- [ ] **Step 2: Production build + bundle check** — `pnpm --filter backstage build`, then dispatch `bundle-budget-watcher` to confirm the zxing/qrcode libs are in a lazy chunk and the main bundle didn't blow its budget.

- [ ] **Step 3: `firestore-security-reviewer`** — verify a Scanner still can't forge memberId/role/activity beyond the rule; activities least-privilege; A3 never writes participations/memberPoints.

- [ ] **Step 4: `/security-review`** on the branch diff (rules + new write paths are the trigger).

- [ ] **Step 5: Emulator e2e** (functions + firestore + auth up; backstage dev):
  - Seed/point-rules: ensure a term + rules exist (`/point-rules` → Inicializar).
  - Create an activity at `/activities` (Assembly, startAt now).
  - On `/check-in`: pick it, manually tap a member (or scan their A5 QR) → assert a `checkIns/{activityId__memberId__Attendee}` doc appears.
  - Assert A2 derived `participations/{…}` + `memberPoints/{member__term}` and the member's profile/leaderboard reflect the points.
  - Re-tap the same member → no duplicate write, no error (roster skip).

- [ ] **Step 6: Final commit / status doc** — write `docs/status/2026-06-06-qr-check-in.md` summarizing what shipped + deferred (A4 offline, realtime roster, Scanner designation UI), then open the PR (`gh pr create`) with the standard template and run `pnpm pr-tests` once more.

---

## Self-review notes

- **Spec coverage:** CheckIn promotion (T1), member-qr (T2), QrCode/QrScanner (T3/T4), activity source create+picker (T5–T7), check-in write+roster+manual (T8–T10), A5 QR (T11), nav/ability gating (T12), activities rules (T13), reviews+e2e (T14). All spec sections mapped.
- **Type consistency:** `CheckInInput` (T1) used by repo (T9) + hooks; `CheckInRecord`/`RosterEntry` (T8) used by repo (T9) + route (T10); `toActivityCreateDoc` (T5) used by repo (T6); `activityKeys`/`checkInKeys` consistent across hooks. `ParticipationRole` reused (not redefined). Category label map extracted once (T10 step 4) and shared.
- **Open risk:** `@luminova/auth/ability` may not be a separate export subpath — if `Action`/`Subject` aren't importable into `nav-config.ts`, inline the string unions (T12 step 5) rather than import. Verify the icon keys (`calendar`, `qr`, `plus`, `target`) exist in `icons.tsx`; add any missing following the existing pattern.
