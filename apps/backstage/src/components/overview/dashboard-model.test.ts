import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase/firestore";
import type { Activity, Ally, Member, MemberPoints } from "@luminova/types";
import type { InitiativeListItem } from "../../features/initiatives/lib/initiative-list-item";
import { buildDashboardModel, deriveActivityFeed, pointsByMonthSeries } from "./dashboard-model";

// Minimal fixtures: cast to the domain types since the selectors read only the
// few fields each factory sets (rest of the required shape is irrelevant here).
function mp(id: string, byMonth: Record<string, number>): MemberPoints {
  return { id, memberId: id, termId: "2026", cumulative: 0, byMonth } as MemberPoints;
}
// birthdate is required on every member doc (memberDocSchema drops the ones that
// lack it at read time), so the fixture carries one — the model reads it for the
// birthdays list.
function member(
  id: string,
  name: string,
  joinMs: number,
  active = true,
  birthMs = Date.UTC(1990, 0, 1),
): Member {
  return {
    id,
    name,
    active,
    joinDate: Timestamp.fromMillis(joinMs),
    birthdate: Timestamp.fromMillis(birthMs),
  } as Member;
}
function activity(
  id: string,
  title: string,
  startMs: number,
  status: Activity["status"],
): Activity {
  return {
    id,
    title,
    status,
    location: null,
    startAt: Timestamp.fromMillis(startMs),
  } as unknown as Activity;
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

describe("deriveActivityFeed", () => {
  const now = new Date(Date.UTC(2026, 5, 14, 12, 0));
  const t = (d: number) => now.getTime() - d * 3600_000;

  it("merges member joins, executed activities, filed initiatives newest-first", () => {
    // a1 startAt is pinned wall-clock; its real instant is t(5)+4h = now-1h (newest).
    const feed = deriveActivityFeed({
      members: [member("m1", "Ana Lopez", t(2))],
      activities: [
        activity("a1", "Asamblea", t(5), "Ejecutada"),
        activity("a2", "Reunion", t(3), "Programada"),
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

  it("excludes future events, including a pinned activity whose real instant is future", () => {
    const feed = deriveActivityFeed({
      members: [member("m1", "A", now.getTime() + 3600_000)],
      // pinned at now → real instant now+4h (Bolivia offset) → still future → excluded
      activities: [activity("af", "Futuro", now.getTime(), "Ejecutada")],
      initiatives: [],
      now,
      limit: 2,
    });
    expect(feed).toEqual([]);
  });
});

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
      allies: [{ id: "al1" }, { id: "al2" }] as unknown as Ally[],
      activities: [activity("a1", "Futuro", thisMonth(20), "Programada")],
      memberPoints: [mp("m1", { "2026-06": 40, "2026-05": 10 })],
      initiatives: [],
      now,
    });
    expect(model.kpis.activeMembers.value).toBe(2);
    expect(model.kpis.activeMembers.trend).toEqual({ dir: "up", label: "+1 · este mes" });
    expect(model.kpis.allies.value).toBe(2);
    expect(model.kpis.allies.trend).toBeUndefined();
    expect(model.kpis.upcomingEvents.value).toBe(1);
    expect(model.kpis.pointsThisMonth.value).toBe(40);
    expect(model.pointsByMonth.map((p) => p.points)).toEqual([10, 40]);
  });

  it("maps upcoming events with chip/time/place/status", () => {
    const model = buildDashboardModel({
      members: [],
      allies: [],
      activities: [
        {
          ...activity("a1", "Asamblea", thisMonth(20, 19), "Programada"),
          location: "Sede JCI",
        } as Activity,
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

  it("lists the next three birthdays chapter-wide, soonest first, without a birth year", () => {
    const model = buildDashboardModel({
      members: [
        member("m1", "Ana", Date.UTC(2021, 0, 1), true, Date.UTC(1992, 5, 20)),
        member("m2", "Beto", Date.UTC(2021, 0, 1), true, Date.UTC(1988, 5, 16)),
        member("m3", "Cinthia", Date.UTC(2021, 0, 1), true, Date.UTC(1995, 5, 18)),
        member("m4", "Dario", Date.UTC(2021, 0, 1), true, Date.UTC(1991, 6, 30)),
      ],
      allies: [],
      activities: [],
      memberPoints: [],
      initiatives: [],
      now,
    });
    expect(model.birthdays.map((b) => b.name)).toEqual(["Beto", "Cinthia", "Ana"]);
    expect(model.birthdays[0]?.label).not.toMatch(/19\d{2}/);
  });
});
