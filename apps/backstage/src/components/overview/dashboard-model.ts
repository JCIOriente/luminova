import type { Activity, Member, MemberPoints } from "@luminova/types";
import type { KpiTrend } from "@luminova/ui";
import type { InitiativeListItem } from "../../features/initiatives/lib/initiative-list-item";
import { filterActivities } from "../../features/activities/lib/activity-filter";
import { BOLIVIA_OFFSET_MS, formatDateChip, formatTime } from "../../lib/datetime";

type DashboardKpi = { label: string; value: number; trend: KpiTrend | undefined };

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
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  const raw = MONTH_LABEL.format(new Date(Date.UTC(year, month - 1, 1))).replace(/[.\s]/g, "");
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

type FeedInput = {
  members: Member[];
  activities: Activity[];
  initiatives: InitiativeListItem[];
  now: Date;
  limit: number;
};

/** Merge real domain events we can already read + timestamp, newest-first, capped. */
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
    items.push({
      id: a.id,
      tone: "blue",
      strong: a.title,
      text: " se realizó",
      at: a.startAt.toDate(),
    });
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
    (m) =>
      m.active &&
      new Date(m.joinDate.toMillis() - BOLIVIA_OFFSET_MS).toISOString().slice(0, 7) === monthKey,
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
      pointsThisMonth: {
        label: "Puntos otorgados (mes)",
        value: pointsThisMonth,
        trend: undefined,
      },
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
