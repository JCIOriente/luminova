import type { Activity, AreaOfOpportunity, InitiativeStatus } from "@luminova/types";
import type { BadgeTone } from "@luminova/ui";
import type { InitiativeListItem } from "./initiative-list-item";

type Timestamp = { toMillis(): number };

const THIRTY_DAYS_MS = 30 * 86_400_000;

interface Progress {
  executed: number;
  total: number;
  pct: number;
}

function childrenOf(activities: Activity[], initiativeId: string): Activity[] {
  return activities.filter((a) => a.parentId === initiativeId);
}

export function computeProgress(activities: Activity[], initiativeId: string): Progress {
  const children = childrenOf(activities, initiativeId);
  const total = children.filter((a) => a.status !== "Cancelada").length;
  const executed = children.filter((a) => a.status === "Ejecutada").length;
  const pct = total === 0 ? 0 : Math.round((executed / total) * 100);
  return { executed, total, pct };
}

export function isClosingSoon(
  item: InitiativeListItem,
  activities: Activity[],
  nowMs: number,
): boolean {
  if (item.status !== "EnEjecucion") return false;
  const byDate = item.endDate.toMillis() - nowMs <= THIRTY_DAYS_MS;
  const { executed, total } = computeProgress(activities, item.id);
  const allDone = total > 0 && executed === total;
  return byDate || allDone;
}

const STATUS_LABEL: Record<InitiativeStatus, string> = {
  Planificacion: "Planificación",
  EnEjecucion: "En curso",
  Finalizado: "Completado",
};

export function statusLabel(status: InitiativeStatus): string {
  return STATUS_LABEL[status];
}

const STATUS_TONE: Record<InitiativeStatus, BadgeTone> = {
  Planificacion: "gray",
  EnEjecucion: "blue",
  Finalizado: "green",
};

export function statusTone(status: InitiativeStatus): BadgeTone {
  return STATUS_TONE[status];
}

const AREA_TONE: Record<AreaOfOpportunity, BadgeTone> = {
  DesarrolloIndividual: "blue",
  DesarrolloComunitario: "teal",
  NegociosEmprendimiento: "amber",
  CooperacionInternacional: "navy",
};

export function areaTone(area: AreaOfOpportunity): BadgeTone {
  return AREA_TONE[area];
}

const MONTH_YEAR = new Intl.DateTimeFormat("es", { month: "short", year: "numeric" });

export function formatMonthYear(ts: Timestamp): string {
  const raw = MONTH_YEAR.format(new Date(ts.toMillis()));
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}
