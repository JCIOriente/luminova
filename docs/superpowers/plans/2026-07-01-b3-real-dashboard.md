# B3 Real Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fabricated board dashboard at `/` with real data derived from already-fetched Firestore reads, plus honest empty states — no new query, repository, or rules surface.

**Architecture:** Pure selectors transform already-cached query data (`useMembers`, `useAllies`, `useActivitiesByTerm`, `useMemberPointsByTerm`, `useInitiativesByTerm`) into a typed `DashboardModel`. `OverviewView` becomes presentational over that model. `overview-mock.ts` is deleted.

**Tech Stack:** React 19, TypeScript strict, TanStack Query v5, Vitest, `@luminova/ui` (`KpiCard`, `LineChart`, `Badge`), `@luminova/types` (`currentTermKey`, `Activity`, `Member`, `MemberPoints`, `InitiativeListItem`).

---

## File structure

- **Create** `apps/backstage/src/components/overview/dashboard-model.ts` — `DashboardModel` types + pure selectors (`monthKeyBolivia`, `pointsByMonthSeries`, `deriveActivityFeed`, `buildDashboardModel`).
- **Create** `apps/backstage/src/components/overview/dashboard-model.test.ts` — selector unit tests.
- **Modify** `apps/backstage/src/lib/datetime.ts` — add `formatTime` + `relativeTimeEs`.
- **Modify** `apps/backstage/src/lib/datetime.test.ts` — tests for the two helpers.
- **Modify** `apps/backstage/src/components/overview/overview-view.tsx` — accept `model`, render real data + empty states, drop mock import.
- **Modify** `apps/backstage/src/routes/_app.index.tsx` — fetch the extra hooks, build the model, pass it.
- **Delete** `apps/backstage/src/components/overview/overview-mock.ts`.

All test commands run from repo root: `pnpm --filter backstage test -- <file>` (vitest). Final gate: `pnpm --filter backstage run ci`.

---

### Task 1: datetime helpers (`formatTime`, `relativeTimeEs`)

**Files:**
- Modify: `apps/backstage/src/lib/datetime.ts`
- Test: `apps/backstage/src/lib/datetime.test.ts`

- [ ] **Step 1: Write the failing tests** — append to `datetime.test.ts`:

```ts
import { formatTime, relativeTimeEs } from "./datetime";
import { Timestamp } from "@luminova/types";

describe("formatTime", () => {
  it("renders the scheduled wall-clock HH:mm in UTC", () => {
    // 2026-06-14T19:00 pinned to UTC
    const ts = Timestamp.fromMillis(Date.UTC(2026, 5, 14, 19, 0));
    expect(formatTime(ts)).toBe("19:00");
  });
});

describe("relativeTimeEs", () => {
  const now = new Date(Date.UTC(2026, 5, 14, 12, 0));
  it("returns 'Hace un momento' under a minute", () => {
    expect(relativeTimeEs(new Date(now.getTime() - 30_000), now)).toBe("Hace un momento");
  });
  it("returns hours for same-day", () => {
    expect(relativeTimeEs(new Date(now.getTime() - 2 * 3600_000), now)).toBe("Hace 2 h");
  });
  it("returns 'Ayer' for ~1 day", () => {
    expect(relativeTimeEs(new Date(now.getTime() - 26 * 3600_000), now)).toBe("Ayer");
  });
  it("returns days for older", () => {
    expect(relativeTimeEs(new Date(now.getTime() - 4 * 86400_000), now)).toBe("Hace 4 d");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter backstage test -- src/lib/datetime.test.ts`
Expected: FAIL — `formatTime`/`relativeTimeEs` are not exported.

- [ ] **Step 3: Implement** — append to `datetime.ts`:

```ts
const TIME = new Intl.DateTimeFormat("es-BO", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

/** "19:00" — the scheduled wall-clock (UTC-pinned, see formatters above). */
export function formatTime(ts: Timestamp): string {
  return TIME.format(ts.toDate());
}

/** Spanish relative time for the activity feed. Coarse buckets, no external dep. */
export function relativeTimeEs(at: Date, now: Date): string {
  const diffMs = now.getTime() - at.getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "Hace un momento";
  if (min < 60) return `Hace ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Ayer";
  return `Hace ${days} d`;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter backstage test -- src/lib/datetime.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/lib/datetime.ts apps/backstage/src/lib/datetime.test.ts
git commit -m "feat(backstage): add formatTime + relativeTimeEs datetime helpers"
```

---

### Task 2: dashboard-model types + `monthKeyBolivia` + `pointsByMonthSeries`

**Files:**
- Create: `apps/backstage/src/components/overview/dashboard-model.ts`
- Test: `apps/backstage/src/components/overview/dashboard-model.test.ts`

- [ ] **Step 1: Write the failing test** — create `dashboard-model.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { MemberPoints } from "@luminova/types";
import { monthKeyBolivia, pointsByMonthSeries } from "./dashboard-model";

function mp(id: string, byMonth: Record<string, number>): MemberPoints {
  return { id, memberId: id, termId: "2026", cumulative: 0, byMonth } as MemberPoints;
}

describe("monthKeyBolivia", () => {
  it("returns YYYY-MM in Bolivia local time", () => {
    // 2026-07-01T02:00Z is still 2026-06-30 in UTC-4
    expect(monthKeyBolivia(new Date(Date.UTC(2026, 6, 1, 2, 0)))).toBe("2026-06");
    expect(monthKeyBolivia(new Date(Date.UTC(2026, 6, 1, 12, 0)))).toBe("2026-07");
  });
});

describe("pointsByMonthSeries", () => {
  it("sums byMonth across members, sorted ascending", () => {
    const points = [mp("a", { "2026-05": 10, "2026-06": 5 }), mp("b", { "2026-06": 7 })];
    expect(pointsByMonthSeries(points)).toEqual([
      { monthKey: "2026-05", label: "May", points: 10 },
      { monthKey: "2026-06", label: "Jun", points: 12 },
    ]);
  });
  it("returns [] for no points", () => {
    expect(pointsByMonthSeries([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter backstage test -- src/components/overview/dashboard-model.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — create `dashboard-model.ts`:

```ts
import type { Activity, Member, MemberPoints, InitiativeListItem } from "@luminova/types";
import type { KpiTrend } from "@luminova/ui";
import { BOLIVIA_OFFSET_MS } from "../../lib/datetime";

export type DashboardKpi = { label: string; value: number; trend: KpiTrend | undefined };

export type UpcomingEventItem = {
  id: string;
  month: string;
  day: string;
  title: string;
  time: string;
  place: string;
  status: { tone: "blue" | "green" | "neutral"; label: string };
};

export type FeedTone = "blue" | "teal" | "green";
export type FeedItem = { id: string; tone: FeedTone; strong: string; text: string; at: Date };

export type PointsMonth = { monthKey: string; label: string; points: number };

export type DashboardModel = {
  kpis: {
    activeMembers: DashboardKpi;
    upcomingEvents: DashboardKpi;
    allies: DashboardKpi;
    pointsThisMonth: DashboardKpi;
  };
  pointsByMonth: PointsMonth[];
  upcomingEvents: UpcomingEventItem[];
  feed: FeedItem[];
};

const MONTH_LABEL = new Intl.DateTimeFormat("es-BO", { month: "short", timeZone: "UTC" });

function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const raw = MONTH_LABEL.format(new Date(Date.UTC(y, m - 1, 1))).replace(/[.\s]/g, "");
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** YYYY-MM of an instant read in Bolivia local time (UTC-4). */
export function monthKeyBolivia(now: Date): string {
  return new Date(now.getTime() - BOLIVIA_OFFSET_MS).toISOString().slice(0, 7);
}

/** Real chart series: total points awarded per month across all members. */
export function pointsByMonthSeries(memberPoints: MemberPoints[]): PointsMonth[] {
  const totals = new Map<string, number>();
  for (const mp of memberPoints) {
    for (const [monthKey, pts] of Object.entries(mp.byMonth)) {
      totals.set(monthKey, (totals.get(monthKey) ?? 0) + pts);
    }
  }
  return [...totals.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([monthKey, points]) => ({ monthKey, label: monthLabel(monthKey), points }));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter backstage test -- src/components/overview/dashboard-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/components/overview/dashboard-model.ts apps/backstage/src/components/overview/dashboard-model.test.ts
git commit -m "feat(backstage): dashboard model types + points-by-month chart series"
```

---

### Task 3: `deriveActivityFeed`

**Files:**
- Modify: `apps/backstage/src/components/overview/dashboard-model.ts`
- Test: `apps/backstage/src/components/overview/dashboard-model.test.ts`

- [ ] **Step 1: Write the failing test** — append:

```ts
import { Timestamp } from "@luminova/types";
import { deriveActivityFeed } from "./dashboard-model";

function member(id: string, name: string, joinMs: number, active = true): Member {
  return { id, name, active, joinDate: Timestamp.fromMillis(joinMs) } as Member;
}
function activity(id: string, title: string, startMs: number, status: Activity["status"]): Activity {
  return { id, title, status, startAt: Timestamp.fromMillis(startMs) } as Activity;
}
function initiative(id: string, title: string, filedMs: number | null): InitiativeListItem {
  return {
    id,
    title,
    kind: "Program",
    status: filedMs ? "Finalizado" : "EnEjecucion",
    finalReport: filedMs ? { filedAt: Timestamp.fromMillis(filedMs), filedBy: "u" } : null,
  } as InitiativeListItem;
}

describe("deriveActivityFeed", () => {
  const now = new Date(Date.UTC(2026, 5, 14, 12, 0));
  const t = (d: number) => now.getTime() - d * 3600_000;

  it("merges member joins, executed activities, filed initiatives newest-first", () => {
    const feed = deriveActivityFeed({
      members: [member("m1", "Ana Lopez", t(2))],
      activities: [
        activity("a1", "Asamblea", t(1), "Ejecutada"),
        activity("a2", "Reunion", t(3), "Programada"), // excluded: not Ejecutada
      ],
      initiatives: [initiative("i1", "Sonrisas", t(5)), initiative("i2", "WIP", null)],
      now,
      limit: 8,
    });
    expect(feed.map((f) => f.id)).toEqual(["a1", "m1", "i1"]);
    expect(feed[0]).toMatchObject({ tone: "blue", strong: "Asamblea" });
    expect(feed[1]).toMatchObject({ tone: "teal", strong: "Ana Lopez" });
    expect(feed[2]).toMatchObject({ tone: "green", strong: "Sonrisas" });
  });

  it("excludes future timestamps and caps at limit", () => {
    const feed = deriveActivityFeed({
      members: [member("m1", "A", now.getTime() + 3600_000)], // future join, excluded
      activities: [],
      initiatives: [],
      now,
      limit: 2,
    });
    expect(feed).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter backstage test -- src/components/overview/dashboard-model.test.ts`
Expected: FAIL — `deriveActivityFeed` not exported.

- [ ] **Step 3: Implement** — append to `dashboard-model.ts`:

```ts
type FeedInput = {
  members: Member[];
  activities: Activity[];
  initiatives: InitiativeListItem[];
  now: Date;
  limit: number;
};

export function deriveActivityFeed({
  members,
  activities,
  initiatives,
  now,
  limit,
}: FeedInput): FeedItem[] {
  const items: FeedItem[] = [];

  for (const m of members) {
    if (!m.active) continue;
    items.push({
      id: m.id,
      tone: "teal",
      strong: m.name,
      text: " se unió como nuevo miembro",
      at: m.joinDate.toDate(),
    });
  }
  for (const a of activities) {
    if (a.status !== "Ejecutada") continue;
    items.push({ id: a.id, tone: "blue", strong: a.title, text: " se realizó", at: a.startAt.toDate() });
  }
  for (const i of initiatives) {
    if (i.status !== "Finalizado" || !i.finalReport) continue;
    items.push({
      id: i.id,
      tone: "green",
      strong: i.title,
      text: " concluyó con informe final",
      at: i.finalReport.filedAt.toDate(),
    });
  }

  return items
    .filter((it) => it.at.getTime() <= now.getTime())
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, limit);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter backstage test -- src/components/overview/dashboard-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/components/overview/dashboard-model.ts apps/backstage/src/components/overview/dashboard-model.test.ts
git commit -m "feat(backstage): derive dashboard activity feed from readable data"
```

---

### Task 4: `buildDashboardModel` orchestrator

**Files:**
- Modify: `apps/backstage/src/components/overview/dashboard-model.ts`
- Test: `apps/backstage/src/components/overview/dashboard-model.test.ts`

- [ ] **Step 1: Write the failing test** — append:

```ts
import { buildDashboardModel } from "./dashboard-model";
import { filterActivities } from "../../features/activities/lib/activity-filter";

describe("buildDashboardModel", () => {
  const now = new Date(Date.UTC(2026, 5, 14, 12, 0));
  const thisMonth = (day: number, hour = 12) => Date.UTC(2026, 5, day, hour);

  it("computes real KPI values + honest 'joined this month' delta", () => {
    const model = buildDashboardModel({
      members: [
        member("m1", "Ana", thisMonth(2)),
        member("m2", "Beto", Date.UTC(2025, 0, 1)),
        member("m3", "Gone", thisMonth(3), false),
      ],
      allies: [{ id: "al1" }, { id: "al2" }] as never,
      activities: [activity("a1", "Futuro", thisMonth(20), "Programada")],
      memberPoints: [mp("m1", { "2026-06": 40, "2026-05": 10 })],
      initiatives: [],
      now,
    });
    expect(model.kpis.activeMembers.value).toBe(2); // m1, m2 (m3 inactive)
    expect(model.kpis.activeMembers.trend).toEqual({ dir: "up", label: "+1 · este mes" }); // m1
    expect(model.kpis.allies.value).toBe(2);
    expect(model.kpis.allies.trend).toBeUndefined();
    expect(model.kpis.upcomingEvents.value).toBe(1);
    expect(model.kpis.pointsThisMonth.value).toBe(40); // byMonth["2026-06"]
    expect(model.pointsByMonth.map((p) => p.points)).toEqual([10, 40]);
  });

  it("maps upcoming events with chip/time/place/status", () => {
    const model = buildDashboardModel({
      members: [],
      allies: [],
      activities: [
        { ...activity("a1", "Asamblea", thisMonth(20, 19), "Programada"), location: "Sede JCI" } as Activity,
      ],
      memberPoints: [],
      initiatives: [],
      now,
    });
    expect(model.upcomingEvents).toHaveLength(1);
    expect(model.upcomingEvents[0]).toMatchObject({
      title: "Asamblea",
      time: "19:00",
      place: "Sede JCI",
      status: { tone: "blue", label: "Programada" },
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter backstage test -- src/components/overview/dashboard-model.test.ts`
Expected: FAIL — `buildDashboardModel` not exported.

- [ ] **Step 3: Implement** — append to `dashboard-model.ts` (add imports for `filterActivities`, `formatDateChip`, `formatTime`, `monthKeyBolivia` already local):

```ts
import { filterActivities } from "../../features/activities/lib/activity-filter";
import { formatDateChip, formatTime } from "../../lib/datetime";

type Ally = { id: string };

type BuildInput = {
  members: Member[];
  allies: Ally[];
  activities: Activity[];
  memberPoints: MemberPoints[];
  initiatives: InitiativeListItem[];
  now: Date;
};

const STATUS_BADGE: Record<Activity["status"], UpcomingEventItem["status"]> = {
  Programada: { tone: "blue", label: "Programada" },
  Ejecutada: { tone: "green", label: "Ejecutada" },
  Cancelada: { tone: "neutral", label: "Cancelada" },
};

function joinedThisMonth(members: Member[], monthKey: string): number {
  return members.filter(
    (m) => m.active && new Date(m.joinDate.toMillis() - BOLIVIA_OFFSET_MS).toISOString().slice(0, 7) === monthKey,
  ).length;
}

export function buildDashboardModel(input: BuildInput): DashboardModel {
  const { members, allies, activities, memberPoints, initiatives, now } = input;
  const monthKey = monthKeyBolivia(now);
  const activeMembers = members.filter((m) => m.active);
  const upcoming = filterActivities(activities, "proximos", now).sort(
    (a, b) => a.startAt.toMillis() - b.startAt.toMillis(),
  );
  const joined = joinedThisMonth(members, monthKey);
  const pointsThisMonth = memberPoints.reduce((sum, mp) => sum + (mp.byMonth[monthKey] ?? 0), 0);

  return {
    kpis: {
      activeMembers: {
        label: "Miembros activos",
        value: activeMembers.length,
        trend: joined > 0 ? { dir: "up", label: `+${joined} · este mes` } : undefined,
      },
      upcomingEvents: { label: "Próximos eventos", value: upcoming.length, trend: undefined },
      allies: { label: "Aliados", value: allies.length, trend: undefined },
      pointsThisMonth: { label: "Puntos otorgados (mes)", value: pointsThisMonth, trend: undefined },
    },
    pointsByMonth: pointsByMonthSeries(memberPoints),
    upcomingEvents: upcoming.map((a) => {
      const chip = formatDateChip(a.startAt);
      return {
        id: a.id,
        month: chip.month,
        day: chip.day,
        title: a.title,
        time: formatTime(a.startAt),
        place: a.location ?? "Sin ubicación",
        status: STATUS_BADGE[a.status],
      };
    }),
    feed: deriveActivityFeed({ members, activities, initiatives, now, limit: 8 }),
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter backstage test -- src/components/overview/dashboard-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/components/overview/dashboard-model.ts apps/backstage/src/components/overview/dashboard-model.test.ts
git commit -m "feat(backstage): buildDashboardModel — real KPIs, events, chart, feed"
```

---

### Task 5: `OverviewView` renders the real model

**Files:**
- Modify: `apps/backstage/src/components/overview/overview-view.tsx`
- Delete: `apps/backstage/src/components/overview/overview-mock.ts`

- [ ] **Step 1: Check for mock references**

Run: `grep -rn "OVERVIEW_MOCK\|overview-mock" apps/backstage/src`
Expected: only `overview-view.tsx` imports it (route passes counts, not the mock). If a test references it, update that test in this task.

- [ ] **Step 2: Rewrite `overview-view.tsx`** — change the signature to `{ model, userName, roles }`, drop the `OVERVIEW_MOCK` import, and render `model`. Key changes:

```tsx
import { Fragment, type ReactNode } from "react";
import type { Role } from "@luminova/auth/roles";
import { Badge, Button, Icon, KpiCard, LineChart, type ChartSeries } from "@luminova/ui";
import { PageHeader } from "../page-header";
import { boardHomeLayout, type WidgetKey } from "./board-home-layout";
import { relativeTimeEs } from "../../lib/datetime";
import type { DashboardModel, FeedTone } from "./dashboard-model";

const WHITESPACE = /\s+/;
function firstName(value: string): string {
  return value.trim().split(WHITESPACE)[0] ?? value;
}

const FEED_DOT: Record<FeedTone, string> = {
  blue: "bg-jci-blue/12 text-jci-blue",
  teal: "bg-jci-teal/16 text-teal-ink",
  green: "bg-ok/14 text-ok",
};

const EVENT_BADGE: Record<DashboardModel["upcomingEvents"][number]["status"]["tone"], "blue" | "green" | "neutral"> = {
  blue: "blue",
  green: "green",
  neutral: "neutral",
};

export function OverviewView({
  model,
  userName,
  roles = [],
}: {
  model: DashboardModel;
  userName: string;
  roles?: readonly Role[];
}) {
  const layout = boardHomeLayout(roles);
  const now = new Date();
  const chartSeries: ChartSeries[] = [
    { label: "Puntos otorgados", color: "#0097D7", values: model.pointsByMonth.map((p) => p.points) },
  ];

  const headerActions = (
    <>
      <Button as="button" type="button" variant="secondary" size="sm" iconLeft={Icon.user({ s: 18 })}>
        Invitar miembro
      </Button>
      <Button as="button" type="button" size="sm" iconLeft={Icon.plus({ s: 18 })}>
        Crear evento
      </Button>
    </>
  );

  const widgets: Record<Exclude<WidgetKey, "headerActions">, () => ReactNode> = {
    kpis: () => (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard icon={Icon.user({ s: 20 })} tone="blue" label={model.kpis.activeMembers.label} value={model.kpis.activeMembers.value} trend={model.kpis.activeMembers.trend} />
        <KpiCard icon={Icon.calendar({ s: 20 })} tone="teal" label={model.kpis.upcomingEvents.label} value={model.kpis.upcomingEvents.value} trend={model.kpis.upcomingEvents.trend} />
        <KpiCard icon={Icon.handshake({ s: 20 })} tone="navy" label={model.kpis.allies.label} value={model.kpis.allies.value} trend={model.kpis.allies.trend} />
        <KpiCard icon={Icon.barChart({ s: 20 })} tone="amber" label={model.kpis.pointsThisMonth.label} value={model.kpis.pointsThisMonth.value} trend={model.kpis.pointsThisMonth.trend} />
      </div>
    ),
    chart: () => (
      <section className="rounded-[16px] border border-line bg-surface shadow-[0_1px_2px_rgba(19,15,45,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-4 px-[22px] pt-5 pb-4">
          <div>
            <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-ink-1">Puntos otorgados por mes</h2>
            <p className="text-[12.5px] text-ink-3">Total del capítulo en la gestión</p>
          </div>
        </div>
        <div className="px-[22px] pb-[22px] text-jci-black">
          {model.pointsByMonth.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-ink-3">Aún no hay puntos otorgados.</p>
          ) : (
            <LineChart series={chartSeries} height={280} />
          )}
        </div>
      </section>
    ),
    upcomingEvents: () => (
      <section className="rounded-[16px] border border-line bg-surface shadow-[0_1px_2px_rgba(19,15,45,0.05)]">
        <div className="flex items-center justify-between px-[22px] pt-5 pb-2">
          <h2 className="text-[16px] font-semibold text-ink-1">Próximos eventos</h2>
        </div>
        <div className="px-3 pb-3">
          {model.upcomingEvents.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-ink-3">No hay eventos próximos.</p>
          ) : (
            model.upcomingEvents.map((e) => (
              <div key={e.id} className="flex items-center gap-4 rounded-[12px] px-3 py-3.5 transition-colors hover:bg-ink-1/[0.04]">
                <div className="flex size-[52px] shrink-0 flex-col items-center justify-center rounded-[11px] border border-line bg-surface-2">
                  <span className="text-[10px] font-bold tracking-[0.1em] text-jci-blue uppercase">{e.month}</span>
                  <span className="text-[21px] font-medium leading-none tracking-[-0.02em] text-ink-1">{e.day}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14.5px] font-semibold text-ink-1">{e.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3">
                    <span>{e.time}</span>
                    <span className="size-[3px] rounded-full bg-ink-3" />
                    <span>{e.place}</span>
                  </div>
                </div>
                <Badge tone={EVENT_BADGE[e.status.tone]} dot>{e.status.label}</Badge>
              </div>
            ))
          )}
        </div>
      </section>
    ),
    recentActivity: () => (
      <section className="rounded-[16px] border border-line bg-surface px-[22px] py-5 shadow-[0_1px_2px_rgba(19,15,45,0.05)]">
        <h2 className="mb-4 text-[16px] font-semibold text-ink-1">Actividad reciente</h2>
        {model.feed.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-ink-3">Sin actividad reciente.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {model.feed.map((a) => (
              <div key={`${a.tone}-${a.id}`} className="flex gap-3.5">
                <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${FEED_DOT[a.tone]}`}>
                  {Icon.bell({ s: 15 })}
                </span>
                <div className="min-w-0">
                  <div className="text-[13.5px] leading-snug text-ink-2">
                    <b className="font-semibold text-ink-1">{a.strong}</b>
                    {a.text}
                  </div>
                  <div className="mt-1 text-[11.5px] text-ink-3 tabular-nums">{relativeTimeEs(a.at, now)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    ),
    quickActions: () => (
      <section>
        <h2 className="mb-3 text-[16px] font-semibold text-ink-1">Accesos rápidos</h2>
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          {QUICK_ACTIONS.map((q) => (
            <button key={q.id} type="button" className="group flex flex-col items-start gap-3.5 rounded-[14px] border border-line bg-surface p-[18px] text-left shadow-[0_1px_2px_rgba(19,15,45,0.05)] transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_18px_40px_-24px_rgba(19,15,45,0.22)]">
              <span className="flex size-[42px] items-center justify-center rounded-[12px] bg-jci-blue/10 text-jci-blue">{Icon[q.icon]({ s: 21 })}</span>
              <span>
                <span className="block text-[14px] font-semibold text-ink-1">{q.title}</span>
                <span className="mt-1 block text-[12.5px] leading-snug text-ink-3">{q.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
    ),
  };

  return (
    <div className="flex flex-col gap-[22px]">
      <PageHeader eyebrow="Inicio" title={`Hola, ${firstName(userName)}`} subtitle="Esto es lo que necesita tu atención hoy." actions={layout.includes("headerActions") ? headerActions : undefined} />
      {layout
        .filter((key): key is Exclude<WidgetKey, "headerActions"> => key !== "headerActions")
        .map((key) => (
          <Fragment key={key}>{widgets[key]()}</Fragment>
        ))}
    </div>
  );
}
```

Add the static quick-action nav constant near the top of the file (these are navigation shortcuts, not data):

```tsx
const QUICK_ACTIONS = [
  { id: "q1", icon: "plus", title: "Crear evento", desc: "Programa una nueva actividad del capítulo" },
  { id: "q2", icon: "user", title: "Invitar miembro", desc: "Suma a alguien a la membresía activa" },
  { id: "q3", icon: "handshake", title: "Registrar aliado", desc: "Añade una empresa u organización aliada" },
  { id: "q4", icon: "barChart", title: "Ver reportes", desc: "Indicadores y exportes del capítulo" },
] as const satisfies readonly { id: string; icon: keyof typeof Icon; title: string; desc: string }[];
```

- [ ] **Step 3: Delete the mock**

Run: `git rm apps/backstage/src/components/overview/overview-mock.ts`

- [ ] **Step 4: Type-check + lint**

Run: `pnpm --filter backstage exec tsc --noEmit && pnpm --filter backstage lint`
Expected: PASS. If `Badge` rejects `tone: "neutral"`, use the nearest existing neutral tone the `Badge` API supports (check `packages/ui/src/components/badge.tsx` for the allowed tones and map `neutral` to it in `EVENT_BADGE`).

- [ ] **Step 5: Commit**

```bash
git add apps/backstage/src/components/overview/overview-view.tsx
git commit -m "feat(backstage): render real dashboard model + honest empty states; drop mock"
```

---

### Task 6: Wire the route

**Files:**
- Modify: `apps/backstage/src/routes/_app.index.tsx`

- [ ] **Step 1: Rewrite the component body** to fetch the extra hooks, build the model, and gate on loading:

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Skeleton } from "@luminova/ui";
import { currentTermKey } from "@luminova/types";
import { useAuth } from "../lib/auth/auth";
import { isMemberOnly } from "../lib/authz/is-member-only";
import { useMembers } from "../features/members/hooks/use-members";
import { useAllies } from "../features/allies/hooks/use-allies";
import { useActivitiesByTerm } from "../features/activities/hooks/use-activities-by-term";
import { useMemberPointsByTerm } from "../features/members/hooks/use-member-points-by-term";
import { useInitiativesByTerm } from "../features/initiatives/hooks/use-initiatives-by-term";
import { OverviewView } from "../components/overview/overview-view";
import { buildDashboardModel } from "../components/overview/dashboard-model";

export const Route = createFileRoute("/_app/")({
  beforeLoad: async ({ context }) => {
    await context.auth.ready;
    if (isMemberOnly(context.auth.getState().claims)) throw redirect({ to: "/me" });
  },
  component: DashboardPage,
});

function DashboardPage() {
  const { user, claims } = useAuth();
  const termId = currentTermKey();
  const members = useMembers();
  const allies = useAllies();
  const activities = useActivitiesByTerm(termId);
  const memberPoints = useMemberPointsByTerm(termId);
  const initiatives = useInitiativesByTerm(termId, { includePrograms: true, includeProjects: true });

  const loading =
    members.isLoading ||
    allies.isLoading ||
    activities.isLoading ||
    memberPoints.isLoading ||
    initiatives.isLoading;

  if (loading || !members.data || !allies.data || !activities.data || !memberPoints.data || !initiatives.data) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[120px]" />
        ))}
      </div>
    );
  }

  const model = buildDashboardModel({
    members: members.data,
    allies: allies.data,
    activities: activities.data,
    memberPoints: memberPoints.data,
    initiatives: initiatives.data,
    now: new Date(),
  });

  return <OverviewView model={model} userName={user?.email ?? "—"} roles={claims.roles} />;
}
```

Note: `buildDashboardModel` types `allies` as `{ id: string }[]`; the real `Ally[]` is structurally compatible (has `id`). If tsc complains about extra props, that's fine — extra properties on an array element type are accepted for assignability. If it does error, widen `Ally` in `dashboard-model.ts` to `{ id: string }` (already minimal) — no change needed.

- [ ] **Step 2: Type-check**

Run: `pnpm --filter backstage exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/backstage/src/routes/_app.index.tsx
git commit -m "feat(backstage): wire real dashboard data into the / route"
```

---

### Task 7: Full gate + cleanup

- [ ] **Step 1: Run the full backstage CI**

Run: `pnpm --filter backstage run ci`
Expected: prettier, eslint, tsc, build, vitest, knip, size-limit all PASS. Fix any knip "unused export" by removing the export or wiring it; fix prettier via `pnpm --filter backstage exec prettier --write` on changed files.

- [ ] **Step 2: `/simplify` on the diff** — run the simplify skill over the branch diff; apply safe reductions.

- [ ] **Step 3: Dispatch `bundle-budget-watcher`** — confirm the backstage `index-*` gz delta is within budget (≤115 kB gz; expected ~flat — pure logic, no new deps). Note the delta.

- [ ] **Step 4: Final commit if simplify/format changed anything**

```bash
git add -A && git commit -m "chore(backstage): simplify dashboard model + format"
```

---

## Self-review

- **Spec coverage:** KPIs (real value + honest delta / dropped trends) ✓ T4; chart real points-by-month ✓ T2/T5; real upcoming events ✓ T4/T5; derived feed ✓ T3/T5; honest empty states ✓ T5; mock deleted ✓ T5; route wiring + loading ✓ T6; no new Firestore/rules surface ✓ (reuses existing hooks); tests TDD ✓ each task.
- **Placeholder scan:** none — every step has concrete code/commands. The one conditional (Badge `neutral` tone / allies assignability) names the exact file to check and the fallback.
- **Type consistency:** `DashboardModel`, `FeedItem`/`FeedTone`, `UpcomingEventItem`, `DashboardKpi`, `buildDashboardModel`, `deriveActivityFeed`, `pointsByMonthSeries`, `monthKeyBolivia`, `relativeTimeEs`, `formatTime` are named identically across tasks. `KpiCard.trend` is optional (verified) → `DashboardKpi.trend: KpiTrend | undefined` matches.

## PR #2 (B1 /me retention) — planned after PR #1 merges

Separate plan doc `2026-07-01-b1-me-retention.md`: pure selectors `memberMilestones(member, now)` + `upcomingBirthdays(members, now, limit)` (name + day/month, no year, exclude self + inactive) + `upcomingEventsForMember` (thin wrapper over `filterActivities`), rendered as two new sections on `_app.me.tsx` (adds `useMembers`; no rules change). Same TDD → gate → PR flow.
