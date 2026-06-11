# Activity Detail Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-first `/activities/$id` detail route that becomes the home for a single activity — its metadata, organizers, photos, and the (moved-here) check-in surface plus edit/cancel actions — and retire the standalone `/check-in` page.

**Architecture:** Mirror the slice-3 initiative-detail idiom (trailing-underscore breakout route, back-link, hero, `SegmentedControl` tabs, `useX($id)` hook, loading/not-found). The check-in scanner/roster surface is extracted from the old `/check-in` route into an embeddable `ActivityCheckIn` component scoped to one fixed activity. The list-page "Nueva actividad" create path drops `ProjectExecution` (standalone-only; ProjectExecution is created only from inside a parent initiative — slice 3).

**Tech Stack:** React 19, TanStack Router (file-based) + Query v5, `@luminova/ui`, `@luminova/auth` (CASL ability), Firestore via `ActivityRepository`. Vitest for unit tests.

**Spec:** `docs/specs/2026-06-10-initiatives-c1-lite-design.md` — "Activity detail — /activities/$id", decision 7 (standalone-only create), Navigation (Check-in sidebar item removed).

**Accepted limitations (do not re-litigate):**
- `ActivityTable` keeps its local `STATUS_TONE` (`Programada: "gray"`); only `initiative-activities` + the new detail page share the hoisted `ACTIVITY_STATUS_TONE` (`Programada: "blue"`). Divergence is intentional — table density vs detail emphasis; no unrequested visual change to the table.
- Photo roll is read-only; gallery upload is slice 6.
- Completion → Finalizado wizard is slice 5; not in scope.

---

### Task 1: Hoist `ACTIVITY_STATUS_TONE` to a shared lib

**Files:**
- Create: `apps/backstage/src/features/activities/lib/status-tone.ts`
- Test: `apps/backstage/src/features/activities/lib/status-tone.test.ts`
- Modify: `apps/backstage/src/features/initiatives/components/initiative-activities.tsx`

- [ ] **Step 1: Write the failing test**

```ts
// status-tone.test.ts
import { describe, expect, it } from "vitest";
import { ACTIVITY_STATUS_TONE } from "./status-tone";

describe("ACTIVITY_STATUS_TONE", () => {
  it("maps every activity status to a tone (Cancelada red, Ejecutada green, Programada blue)", () => {
    expect(ACTIVITY_STATUS_TONE.Programada).toBe("blue");
    expect(ACTIVITY_STATUS_TONE.Ejecutada).toBe("green");
    expect(ACTIVITY_STATUS_TONE.Cancelada).toBe("red");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backstage test -- status-tone`
Expected: FAIL — cannot find `./status-tone`.

- [ ] **Step 3: Write minimal implementation**

```ts
// status-tone.ts
import type { ActivityStatus } from "@luminova/types";
import type { BadgeTone } from "@luminova/ui";

export const ACTIVITY_STATUS_TONE: Record<ActivityStatus, BadgeTone> = {
  Programada: "blue",
  Ejecutada: "green",
  Cancelada: "red",
};
```

- [ ] **Step 4: Repoint `initiative-activities.tsx`**

Remove the local `const ACTIVITY_STATUS_TONE` block at the bottom of the file and its now-unused `ActivityStatus` / `BadgeTone` type imports if they are unused elsewhere in the file (`Activity` is still used). Add the import near the top:

```ts
import { ACTIVITY_STATUS_TONE } from "../../activities/lib/status-tone";
```

Leave the JSX usage `tone={ACTIVITY_STATUS_TONE[activity.status]}` unchanged.

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm --filter backstage test -- status-tone && pnpm --filter backstage typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/backstage/src/features/activities/lib/status-tone.ts apps/backstage/src/features/activities/lib/status-tone.test.ts apps/backstage/src/features/initiatives/components/initiative-activities.tsx
git commit -m "refactor(backstage): hoist ACTIVITY_STATUS_TONE to shared activities lib"
```

---

### Task 2: `activityKeys.byId` + `useActivity` hook

**Files:**
- Modify: `apps/backstage/src/features/activities/hooks/activity-keys.ts`
- Create: `apps/backstage/src/features/activities/hooks/use-activity.ts`
- Test: `apps/backstage/src/features/activities/hooks/activity-keys.test.ts`

`ActivityRepository.getById(id): Promise<Activity | null>` already exists (`repositories/activity-repository.ts`).

- [ ] **Step 1: Write the failing test**

```ts
// activity-keys.test.ts
import { describe, expect, it } from "vitest";
import { activityKeys } from "./activity-keys";

describe("activityKeys", () => {
  it("builds a stable byId key", () => {
    expect(activityKeys.byId("act_1")).toEqual(["activities", "detail", "act_1"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backstage test -- activity-keys`
Expected: FAIL — `activityKeys.byId is not a function`.

- [ ] **Step 3: Add the key**

```ts
// activity-keys.ts
export const activityKeys = {
  all: ["activities"] as const,
  byTerm: (termId: string) => ["activities", "term", termId] as const,
  byId: (id: string) => ["activities", "detail", id] as const,
};
```

- [ ] **Step 4: Create the hook**

```ts
// use-activity.ts
import { useQuery } from "@tanstack/react-query";
import type { Activity } from "@luminova/types";
import { ActivityRepository } from "../repositories/activity-repository";
import { activityKeys } from "./activity-keys";

export function useActivity(id: string, opts?: { enabled?: boolean }) {
  return useQuery<Activity | null>({
    queryKey: activityKeys.byId(id),
    queryFn: () => new ActivityRepository().getById(id),
    enabled: opts?.enabled ?? true,
  });
}
```

- [ ] **Step 5: Run test + typecheck**

Run: `pnpm --filter backstage test -- activity-keys && pnpm --filter backstage typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backstage/src/features/activities/hooks/activity-keys.ts apps/backstage/src/features/activities/hooks/activity-keys.test.ts apps/backstage/src/features/activities/hooks/use-activity.ts
git commit -m "feat(backstage): add useActivity(\$id) hook + byId query key"
```

---

### Task 3: `formatActivityDateTime` helper + reverse initiative-type map

**Files:**
- Create: `apps/backstage/src/features/activities/lib/format.ts`
- Test: `apps/backstage/src/features/activities/lib/format.test.ts`
- Modify: `apps/backstage/src/features/initiatives/hooks/use-initiative.ts`

- [ ] **Step 1: Write the failing test**

```ts
// format.test.ts
import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import { formatActivityDateTime } from "./format";

describe("formatActivityDateTime", () => {
  it("formats a Firestore timestamp in es-BO medium date + short time", () => {
    const ts = Timestamp.fromDate(new Date("2026-03-15T19:30:00Z"));
    const out = formatActivityDateTime(ts);
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backstage test -- "activities/lib/format"`
Expected: FAIL — cannot find `./format`.

- [ ] **Step 3: Implement the formatter**

```ts
// format.ts
import type { Timestamp } from "@luminova/types";

const DATE_TIME = new Intl.DateTimeFormat("es-BO", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatActivityDateTime(ts: Timestamp): string {
  return DATE_TIME.format(ts.toDate());
}
```

- [ ] **Step 4: Add the reverse KIND map to `use-initiative.ts`**

After the existing `KIND` const, add:

```ts
export const INITIATIVE_TYPE: Record<InitiativeKind, InitiativeType> = {
  Program: "program",
  Project: "project",
};
```

(`InitiativeKind` is already imported from `@luminova/types` in that file.)

- [ ] **Step 5: Run test + typecheck**

Run: `pnpm --filter backstage test -- "activities/lib/format" && pnpm --filter backstage typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backstage/src/features/activities/lib/format.ts apps/backstage/src/features/activities/lib/format.test.ts apps/backstage/src/features/initiatives/hooks/use-initiative.ts
git commit -m "feat(backstage): activity datetime formatter + reverse initiative-type map"
```

---

### Task 4: `ActivityCheckIn` embeddable component (scoped to one activity)

Extract the scanner/roster/manual-tap surface from the old `/check-in` board into a component that takes a **fixed** `activityId` (no picker). The detail-page check-in tab renders this; the standalone route is removed in Task 8.

**Files:**
- Create: `apps/backstage/src/features/check-in/components/activity-check-in.tsx`

Reuse, unchanged: `roster.ts` (`buildRosterEntries`, `alreadyCheckedIn`), `RosterList`, `ManualTapList`, `useActivityCheckIns`, `useCreateCheckIn`, `decodeMemberQr`, the lazy `QrScanner`.

- [ ] **Step 1: Create the component**

```tsx
// activity-check-in.tsx
import { lazy, Suspense, useMemo } from "react";
import type { Member } from "@luminova/types";
import { useActivityCheckIns } from "../hooks/use-activity-check-ins";
import { useCreateCheckIn } from "../hooks/use-create-check-in";
import { RosterList } from "./roster-list";
import { ManualTapList } from "./manual-tap-list";
import { alreadyCheckedIn, buildRosterEntries } from "../roster";
import { decodeMemberQr } from "../../../lib/member-qr";

const LazyQrScanner = lazy(() =>
  import("@luminova/ui/qr-scanner").then((m) => ({ default: m.QrScanner })),
);

interface ActivityCheckInProps {
  activityId: string;
  members: Member[];
}

export function ActivityCheckIn({ activityId, members }: ActivityCheckInProps) {
  const { data: checkIns } = useActivityCheckIns(activityId);
  const create = useCreateCheckIn(activityId);

  const roster = useMemo(
    () => buildRosterEntries(checkIns ?? [], members),
    [checkIns, members],
  );
  const checkedInIds = (checkIns ?? []).map((c) => c.memberId);

  const checkIn = (memberId: string) => {
    if (alreadyCheckedIn(checkIns ?? [], memberId)) return; // idempotent: skip re-write
    create.mutate({ memberId, activityId, role: "Attendee" });
  };

  const onScan = (text: string) => {
    const memberId = decodeMemberQr(text);
    if (memberId) checkIn(memberId);
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      <Suspense fallback={<p className="text-ink-3">Cargando cámara…</p>}>
        <LazyQrScanner
          onScan={onScan}
          paused={create.isPending}
          className="aspect-square w-full rounded-[14px] bg-ink-1/5 object-cover"
        />
      </Suspense>
      <RosterList entries={roster} />
      <ManualTapList members={members} checkedInIds={checkedInIds} onTap={checkIn} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter backstage typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/backstage/src/features/check-in/components/activity-check-in.tsx
git commit -m "feat(backstage): extract ActivityCheckIn embeddable surface"
```

---

### Task 5: `ActivityDetailHero` component

Parallels `InitiativeHero`. Shows cover/strip, category chip, status badge, parent link, kind eyebrow, date range, organizers (director + co-directors), and an `actions` slot for Edit/Cancel.

**Files:**
- Create: `apps/backstage/src/features/activities/components/activity-detail-hero.tsx`

`Member` lookups are passed in as a resolved `directorId → Member` map plus the activity. Avatar/AvatarStack come from `@luminova/ui`.

- [ ] **Step 1: Create the component**

```tsx
// activity-detail-hero.tsx
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { Activity, Member } from "@luminova/types";
import { Avatar, AvatarStack, Badge, Icon } from "@luminova/ui";
import { CATEGORY_LABELS } from "../category-labels";
import { ACTIVITY_STATUS_TONE } from "../lib/status-tone";
import { formatActivityDateTime } from "../lib/format";
import { INITIATIVE_TYPE } from "../../initiatives/hooks/use-initiative";

interface ActivityDetailHeroProps {
  activity: Activity;
  director: Member | null;
  coDirectors: Member[];
  parentTitle: string | null;
  actions?: ReactNode;
}

export function ActivityDetailHero({
  activity,
  director,
  coDirectors,
  parentTitle,
  actions,
}: ActivityDetailHeroProps) {
  const cover = activity.photos[0]?.url ?? null;
  const dateRange =
    activity.endAt === null
      ? formatActivityDateTime(activity.startAt)
      : `${formatActivityDateTime(activity.startAt)} — ${formatActivityDateTime(activity.endAt)}`;
  const coDirectorPeople = coDirectors.map((m) => ({ name: m.name, src: m.profilePicture }));

  return (
    <header className="flex flex-col gap-4 overflow-hidden rounded-card border border-line bg-surface">
      {cover ? (
        <img src={cover} alt="" className="h-44 w-full object-cover" />
      ) : (
        <span className="h-1 w-full bg-jci-blue" aria-hidden />
      )}

      <div className="flex flex-col gap-3 px-5 pb-5">
        <div className="flex items-start gap-3">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <Badge tone="gray" dot>
              {CATEGORY_LABELS[activity.category]}
            </Badge>
            <Badge tone={ACTIVITY_STATUS_TONE[activity.status]}>{activity.status}</Badge>
            {activity.parentType && activity.parentId && (
              <Link
                to="/initiatives/$type/$id"
                params={{ type: INITIATIVE_TYPE[activity.parentType], id: activity.parentId }}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-jci-blue hover:underline"
              >
                {Icon.briefcase({ s: 14 })}
                {parentTitle ?? "Ver proyecto"}
              </Link>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>

        <div>
          <h1 className="text-[24px] font-semibold leading-tight text-ink-1">{activity.title}</h1>
          <p className="mt-2 flex items-center gap-1.5 text-[13px] text-ink-3 tabular-nums">
            {Icon.calendar({ s: 14 })}
            {dateRange}
          </p>
        </div>

        {(director || coDirectorPeople.length > 0) && (
          <div className="flex items-center gap-4">
            {director && (
              <span className="flex items-center gap-2">
                <Avatar src={director.profilePicture} name={director.name} size={32} />
                <span className="flex flex-col">
                  <span className="text-[11px] uppercase tracking-wide text-ink-4">Director</span>
                  <span className="text-[13px] font-medium text-ink-1">{director.name}</span>
                </span>
              </span>
            )}
            {coDirectorPeople.length > 0 && (
              <span className="flex items-center gap-2">
                <AvatarStack people={coDirectorPeople} max={3} />
                <span className="text-[12px] text-ink-3">
                  {coDirectorPeople.length === 1 ? "Codirector" : "Codirectores"}
                </span>
              </span>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
```

> Note for implementer: confirm `AvatarStack`'s `people` prop shape against `apps/backstage/src/components/initiative-card.tsx:82` (`<AvatarStack people={people} max={3} />`) and `Avatar` props against `initiative-team-rail.tsx:60` (`<Avatar src={person.profilePicture} name={person.name} size={...} />`). Match the existing shape exactly; if `AvatarStack` expects a different key than `{name, src}`, adapt `coDirectorPeople`.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter backstage typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/backstage/src/features/activities/components/activity-detail-hero.tsx
git commit -m "feat(backstage): ActivityDetailHero component"
```

---

### Task 6: Activity detail route `/activities/$id`

**Files:**
- Create: `apps/backstage/src/routes/_app.activities_.$id.tsx`

Assembles: back-link, `ActivityDetailHero` (Edit/Cancel in actions), `SegmentedControl` tabs `[Detalle | Check-in]`, Detalle tab (description + read-only photo roll), Check-in tab (`ActivityCheckIn`, ability-gated), Edit `Sheet` (`ActivityForm`, full categories, respects check-in lock), Cancel `Dialog`. Mirror loading/not-found from slice-3.

- [ ] **Step 1: Create the route**

```tsx
// _app.activities_.$id.tsx
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Badge, Button, Dialog, EmptyState, Icon, SegmentedControl, Sheet, Toast } from "@luminova/ui";
import type { ComboboxOption, SegmentedOption } from "@luminova/ui";
import type { Activity, ActivityInput, Member } from "@luminova/types";
import { subject } from "@luminova/auth/ability";
import { useAbility } from "../lib/authz/ability-context";
import { currentTermId } from "../lib/current-term";
import { useActivity } from "../features/activities/hooks/use-activity";
import { useMembers } from "../features/members/hooks/use-members";
import { useProgramsByTerm } from "../features/programs/hooks/use-programs-by-term";
import { useProjectsByTerm } from "../features/projects/hooks/use-projects-by-term";
import { useUpdateActivity } from "../features/activities/hooks/use-update-activity";
import { useCancelActivity } from "../features/activities/hooks/use-cancel-activity";
import { ActivityRepository } from "../features/activities/repositories/activity-repository";
import { ActivityLockedError } from "../features/activities/repositories/activity-guard";
import { ActivityForm } from "../features/activities/components/activity-form";
import { ActivityDetailHero } from "../features/activities/components/activity-detail-hero";
import { ActivityCheckIn } from "../features/check-in/components/activity-check-in";
import { CATEGORY_LABELS } from "../features/activities/category-labels";

export const Route = createFileRoute("/_app/activities_/$id")({ component: ActivityDetailPage });

type Tab = "detalle" | "check-in";

function activityToInput(a: Activity): Partial<ActivityInput> {
  return {
    title: a.title,
    description: a.description ?? "",
    category: a.category,
    parentType: a.parentType,
    parentId: a.parentId,
    startAt: new Date(a.startAt.toMillis()).toISOString().slice(0, 16),
    endAt: a.endAt === null ? null : new Date(a.endAt.toMillis()).toISOString().slice(0, 16),
    directorId: a.organizers.directorId,
    coDirectorIds: a.organizers.coDirectorIds,
  };
}

function ActivityDetailPage() {
  const { id } = Route.useParams();
  const termId = currentTermId();
  const ability = useAbility();

  const canRead = ability.can("read", "Activity");
  const canUpdate = ability.can("update", "Activity");
  const canReadMembers = ability.can("read", "Member");

  const { data: activity, isLoading } = useActivity(id, { enabled: canRead });
  const { data: members } = useMembers({ enabled: canReadMembers });
  const { data: programs } = useProgramsByTerm(termId, { enabled: canRead });
  const { data: projects } = useProjectsByTerm(termId, { enabled: canRead });

  const update = useUpdateActivity(termId);
  const cancelActivity = useCancelActivity(termId);

  const [tab, setTab] = useState<Tab>("detalle");
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const memberById = useMemo(
    () => new Map<string, Member>((members ?? []).map((m) => [m.id, m])),
    [members],
  );
  const memberOptions: ComboboxOption[] = useMemo(
    () => (members ?? []).map((m) => ({ value: m.id, label: m.name })),
    [members],
  );
  const programOptions: ComboboxOption[] = useMemo(
    () => (programs ?? []).map((p) => ({ value: p.id, label: p.title })),
    [programs],
  );
  const projectOptions: ComboboxOption[] = useMemo(
    () => (projects ?? []).map((p) => ({ value: p.id, label: p.title })),
    [projects],
  );

  const { data: checkInCount } = useQuery({
    queryKey: ["activities", "checkin-count", id],
    queryFn: () => new ActivityRepository().countCheckIns(id),
    enabled: canRead,
  });
  const locked = (checkInCount ?? 0) > 0;

  if (!canRead) {
    return (
      <EmptyState
        icon={Icon.calendar({ s: 40 })}
        title="Sin acceso"
        description="No tienes permiso para ver esta actividad."
      />
    );
  }
  if (isLoading) return <p className="text-ink-3">Cargando…</p>;
  if (!activity) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-ink-2">Actividad no encontrada.</p>
        <Link to="/activities" className="text-jci-blue hover:underline">
          ← Volver a Actividades
        </Link>
      </div>
    );
  }

  const director = activity.organizers.directorId
    ? memberById.get(activity.organizers.directorId) ?? null
    : null;
  const coDirectors = activity.organizers.coDirectorIds
    .map((cid) => memberById.get(cid))
    .filter((m): m is Member => m !== undefined);
  const parentTitle =
    activity.parentId && activity.parentType === "Program"
      ? (programs ?? []).find((p) => p.id === activity.parentId)?.title ?? null
      : activity.parentId && activity.parentType === "Project"
        ? (projects ?? []).find((p) => p.id === activity.parentId)?.title ?? null
        : null;

  const canCheckIn = ability.can("checkIn", subject("Attendance", { eventId: activity.id }));

  const handleUpdate = async (data: ActivityInput) => {
    if (!canUpdate) return;
    try {
      await update.mutateAsync({ id: activity.id, data });
      setEditOpen(false);
    } catch (err) {
      setToast(
        err instanceof ActivityLockedError ? err.message : "No se pudo guardar la actividad.",
      );
    }
  };

  const confirmCancel = async () => {
    try {
      await cancelActivity.mutateAsync(activity.id);
    } catch {
      setToast("No se pudo cancelar la actividad.");
    }
    setCancelOpen(false);
  };

  const tabs: readonly SegmentedOption<Tab>[] = [
    { value: "detalle", label: "Detalle" },
    { value: "check-in", label: "Check-in" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Link to="/activities" className="text-[13px] text-ink-3 hover:text-ink-1">
        ← Volver a Actividades
      </Link>

      <ActivityDetailHero
        activity={activity}
        director={director}
        coDirectors={coDirectors}
        parentTitle={parentTitle}
        actions={
          canUpdate &&
          activity.status !== "Cancelada" && (
            <>
              <Button as="button" type="button" variant="secondary" onClick={() => setEditOpen(true)}>
                Editar
              </Button>
              <Button as="button" type="button" variant="ghost" onClick={() => setCancelOpen(true)}>
                Cancelar
              </Button>
            </>
          )
        }
      />

      <SegmentedControl<Tab>
        aria-label="Vistas de la actividad"
        options={tabs}
        value={tab}
        onChange={setTab}
      />

      {tab === "detalle" && (
        <div className="flex flex-col gap-6">
          {activity.description && (
            <p className="max-w-2xl text-[14px] leading-relaxed text-ink-2">{activity.description}</p>
          )}
          {activity.photos.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {activity.photos.map((photo, i) => (
                <img
                  key={photo.url}
                  src={photo.url}
                  alt={`${activity.title} — foto ${i + 1}`}
                  className="aspect-[4/3] w-full rounded-card border border-line object-cover"
                />
              ))}
            </div>
          )}
          {!activity.description && activity.photos.length === 0 && (
            <EmptyState
              title="Sin detalle"
              description="Edita la actividad para agregar una descripción."
            />
          )}
        </div>
      )}

      {tab === "check-in" &&
        (canCheckIn ? (
          <ActivityCheckIn activityId={activity.id} members={members ?? []} />
        ) : (
          <EmptyState
            icon={Icon.qr({ s: 40 })}
            title="Sin acceso"
            description="El registro de asistencia está disponible para administración y dirección de proyectos."
          />
        ))}

      <Sheet open={editOpen} onOpenChange={setEditOpen} title="Editar actividad">
        <ActivityForm
          key={activity.id}
          defaultValues={activityToInput(activity)}
          memberOptions={memberOptions}
          programOptions={programOptions}
          projectOptions={projectOptions}
          locked={locked}
          isSaving={update.isPending}
          submitLabel="Guardar"
          onSubmit={(data) => void handleUpdate(data)}
        />
      </Sheet>

      <Dialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancelar actividad"
        description="¿Cancelar la actividad? Se marcará como Cancelada, no se borra."
      >
        <div className="flex justify-end gap-3">
          <Button as="button" type="button" variant="secondary" onClick={() => setCancelOpen(false)}>
            Volver
          </Button>
          <Button as="button" type="button" onClick={() => void confirmCancel()}>
            Cancelar actividad
          </Button>
        </div>
      </Dialog>

      {toast && <Toast message={toast} icon={Icon.close({ s: 18 })} />}
    </div>
  );
}
```

> Note for implementer: `CATEGORY_LABELS` import is only needed if you surface the label here; the hero already renders it. Remove the import if unused (knip/lint will flag). Confirm `SegmentedControl`, `EmptyState`, `Toast`, `Dialog` are exported from `@luminova/ui` (they are used in slice-3 / activities list).

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter backstage typecheck`
Expected: PASS (route file picked up by the generator at build; see Task 9 for routeTree regen).

- [ ] **Step 3: Commit**

```bash
git add apps/backstage/src/routes/_app.activities_.\$id.tsx
git commit -m "feat(backstage): /activities/\$id detail route with embedded check-in"
```

---

### Task 7: Restrict list-page create to standalone categories

`ActivityForm` currently renders all `ACTIVITY_CATEGORIES`. Add an optional `categoryOptions` prop (default all). The list page passes standalone-only on create; edit keeps the full set so `ProjectExecution` edits still resolve their parent picker.

**Files:**
- Modify: `apps/backstage/src/features/activities/components/activity-form.tsx`
- Create: `apps/backstage/src/features/activities/lib/categories.ts`
- Test: `apps/backstage/src/features/activities/lib/categories.test.ts`
- Modify: `apps/backstage/src/routes/_app.activities.tsx`

- [ ] **Step 1: Write the failing test**

```ts
// categories.test.ts
import { describe, expect, it } from "vitest";
import { STANDALONE_CATEGORIES } from "./categories";

describe("STANDALONE_CATEGORIES", () => {
  it("excludes ProjectExecution (created only inside a parent initiative)", () => {
    expect(STANDALONE_CATEGORIES).not.toContain("ProjectExecution");
    expect(STANDALONE_CATEGORIES).toContain("Assembly");
    expect(STANDALONE_CATEGORIES).toContain("Course");
    expect(STANDALONE_CATEGORIES).toContain("TM");
    expect(STANDALONE_CATEGORIES).toContain("Anniversary");
    expect(STANDALONE_CATEGORIES).toContain("NationalEvent");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backstage test -- "activities/lib/categories"`
Expected: FAIL — cannot find `./categories`.

- [ ] **Step 3: Implement the const**

```ts
// categories.ts
import { ACTIVITY_CATEGORIES, type ActivityCategory } from "@luminova/types";

/** Categories creatable as standalone activities (decision 7). ProjectExecution is created only from inside a parent initiative. */
export const STANDALONE_CATEGORIES: ActivityCategory[] = ACTIVITY_CATEGORIES.filter(
  (c) => c !== "ProjectExecution",
);
```

- [ ] **Step 4: Add `categoryOptions` prop to `ActivityForm`**

In `activity-form.tsx`: add to props interface

```ts
  /** Restrict the category select (default: all categories). */
  categoryOptions?: readonly ActivityCategory[];
```

Import the type: change the `@luminova/types` import to also bring `ActivityCategory`:

```ts
import { activitySchema, type ActivityInput, type ActivityCategory, ACTIVITY_CATEGORIES } from "@luminova/types";
```

Destructure with default in the component signature:

```ts
  categoryOptions = ACTIVITY_CATEGORIES,
```

Replace the category `.map(...)` source from `ACTIVITY_CATEGORIES` to `categoryOptions`:

```tsx
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
```

- [ ] **Step 5: Pass standalone-only on create in `_app.activities.tsx`**

Import the const:

```ts
import { STANDALONE_CATEGORIES } from "../features/activities/lib/categories";
import { ACTIVITY_CATEGORIES } from "@luminova/types";
```

On the `<ActivityForm>` in the Sheet add:

```tsx
            categoryOptions={editing === "new" ? STANDALONE_CATEGORIES : ACTIVITY_CATEGORIES}
```

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm --filter backstage test -- "activities/lib/categories" && pnpm --filter backstage typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/backstage/src/features/activities/components/activity-form.tsx apps/backstage/src/features/activities/lib/categories.ts apps/backstage/src/features/activities/lib/categories.test.ts apps/backstage/src/routes/_app.activities.tsx
git commit -m "feat(backstage): standalone-only categories on activity create (decision 7)"
```

---

### Task 8: Repoint slice-3 child-activity rows to `/activities/$id`

**Files:**
- Modify: `apps/backstage/src/features/initiatives/components/initiative-activities.tsx`

- [ ] **Step 1: Change the Link target**

Replace:

```tsx
              <Link
                to="/activities"
```

with:

```tsx
              <Link
                to="/activities/$id"
                params={{ id: activity.id }}
```

(Keep all existing className/children unchanged.)

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter backstage typecheck`
Expected: PASS (route exists from Task 6 once routeTree regenerated in Task 9; if typecheck runs before regen it may flag the param — run Task 9 regen first if so).

- [ ] **Step 3: Commit**

```bash
git add apps/backstage/src/features/initiatives/components/initiative-activities.tsx
git commit -m "feat(backstage): repoint initiative child-activity rows to /activities/\$id"
```

---

### Task 9: Remove the standalone `/check-in` route + nav item

The check-in surface now lives on the activity detail page. Remove the route, the nav item, and the now-unused `ActivityPicker`. Update the nav-config test.

**Files:**
- Delete: `apps/backstage/src/routes/_app.check-in.tsx`
- Delete: `apps/backstage/src/features/check-in/components/activity-picker.tsx`
- Modify: `apps/backstage/src/components/nav-config.ts`
- Modify: `apps/backstage/src/components/nav-config.test.ts`

- [ ] **Step 1: Remove the nav item**

In `nav-config.ts`, delete the `/check-in` entry from the "Reconocimiento" group:

```ts
      {
        to: "/check-in",
        label: "Check-in",
        icon: "qr",
        subject: "Attendance",
        action: "checkIn",
      },
```

Also remove `"/check-in"` from the `NavItem["to"]` union type.

- [ ] **Step 2: Update the nav-config test**

Open `nav-config.test.ts`. Find any assertion referencing `/check-in`, `Check-in`, or `checkIn`/`Attendance` nav visibility and remove/adjust it so the suite reflects the item's removal. Run the suite to see exactly which assertions reference it:

Run: `pnpm --filter backstage test -- nav-config`
Expected after edits: PASS with no `/check-in` references.

- [ ] **Step 3: Delete the route + picker files**

```bash
git rm apps/backstage/src/routes/_app.check-in.tsx apps/backstage/src/features/check-in/components/activity-picker.tsx
```

- [ ] **Step 4: Grep for stragglers**

Run: `grep -rn "/check-in\|ActivityPicker\|activity-picker" apps/backstage/src --include=*.ts --include=*.tsx | grep -v routeTree.gen`
Expected: no matches (routeTree regenerates in next task).

- [ ] **Step 5: Commit**

```bash
git add -A apps/backstage/src/components/nav-config.ts apps/backstage/src/components/nav-config.test.ts
git commit -m "feat(backstage): remove standalone /check-in route + nav item (moved to activity detail)"
```

---

### Task 10: Regenerate routeTree + full verification

**Files:**
- Modify (generated): `apps/backstage/src/routeTree.gen.ts`

- [ ] **Step 1: Regenerate the route tree**

The TanStack Router plugin regenerates `routeTree.gen.ts` on dev/build. Trigger it via a build:

Run: `pnpm --filter backstage build`
Expected: build succeeds; `routeTree.gen.ts` now includes `/_app/activities_/$id` and no longer includes `/_app/check-in`.

- [ ] **Step 2: Verify the generated tree**

Run: `grep -n "activities_/\$id\|check-in" apps/backstage/src/routeTree.gen.ts`
Expected: a match for `activities_/$id`, no match for `check-in`.

- [ ] **Step 3: Full local gate**

Run from repo root (rules-tests excluded if a dev emulator holds :4010 — check `lsof -ti tcp:4010`):

```bash
turbo run ci --filter='!@luminova/firestore-rules-tests' --filter='!@luminova/storage-rules-tests'
pnpm knip
pnpm audit --audit-level=high
```

Expected: typecheck/lint/test/build PASS; knip reports no new unused exports (the deleted `activity-picker` + old board imports should be gone); audit clean.

- [ ] **Step 4: Commit the regenerated tree**

```bash
git add apps/backstage/src/routeTree.gen.ts
git commit -m "chore(backstage): regenerate routeTree for activity detail + check-in removal"
```

---

## Self-Review

**Spec coverage:**
- Activity detail route w/ title, category, parent link, dates, organizers, status badge, description, read-only photos → Tasks 5 + 6. ✓
- `useActivity($id)` perm-gated → Task 2 + route gating. ✓
- Check-in moved onto detail page (embedded), edit + cancel here, check-in lock respected → Tasks 4 + 6. ✓
- `/check-in` sidebar item + route removed → Task 9. ✓
- Standalone-only create (drop ProjectExecution) → Task 7. ✓
- Child-activity rows repointed → Task 8. ✓
- `ACTIVITY_STATUS_TONE` hoisted (2+ uses) → Task 1. ✓

**Type consistency:** `useActivity(id, {enabled})`, `activityKeys.byId(id)`, `formatActivityDateTime(ts)`, `INITIATIVE_TYPE[kind]`, `STANDALONE_CATEGORIES`, `ActivityCheckIn({activityId, members})`, `ActivityDetailHero({activity, director, coDirectors, parentTitle, actions})` — names consistent across tasks.

**Watch-outs baked in:** nav-config also edited by K-track → rebase carefully before PR; routeTree regen in its own commit; `AvatarStack`/`Avatar` prop-shape verification note in Task 5; `subject("Attendance",{eventId})` gate is stricter-correct than the old unconditional page gate (honors scoped scanners) → flag for firestore-security-reviewer.
