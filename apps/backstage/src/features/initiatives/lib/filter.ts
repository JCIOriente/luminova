import type { AreaOfOpportunity, InitiativeKind } from "@luminova/types";
import type { InitiativeListItem } from "./initiative-list-item";

export type InitiativeTab = "todos" | "activos" | "completados";

export interface InitiativeFilter {
  tab: InitiativeTab;
  kind: InitiativeKind | "all";
  area: AreaOfOpportunity | "all";
  query: string;
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function matchesTab(status: InitiativeListItem["status"], tab: InitiativeTab): boolean {
  if (tab === "todos") return true;
  if (tab === "completados") return status === "Finalizado";
  return status !== "Finalizado";
}

export function filterInitiatives(
  items: InitiativeListItem[],
  filter: InitiativeFilter,
): InitiativeListItem[] {
  const q = normalize(filter.query.trim());
  return items.filter(
    (i) =>
      matchesTab(i.status, filter.tab) &&
      (filter.kind === "all" || i.kind === filter.kind) &&
      (filter.area === "all" || i.category === filter.area) &&
      (q === "" || normalize(i.title).includes(q)),
  );
}

export function tabCounts(items: InitiativeListItem[]): Record<InitiativeTab, number> {
  const completados = items.filter((i) => i.status === "Finalizado").length;
  return { todos: items.length, activos: items.length - completados, completados };
}
