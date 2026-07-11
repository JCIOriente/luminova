import type { Lead, LeadIntent, LeadStatus } from "@luminova/types";

export type IntentFilter = "Todos" | LeadIntent;
export type StatusFilter = "Todos" | LeadStatus;

export interface LeadFilters {
  search: string;
  intent: IntentFilter;
  status: StatusFilter;
}

export function filterLeads(leads: Lead[], { search, intent, status }: LeadFilters): Lead[] {
  const q = search.trim().toLowerCase();
  return leads.filter((lead) => {
    if (intent !== "Todos" && lead.intent !== intent) return false;
    if (status !== "Todos" && lead.status !== status) return false;
    if (!q) return true;
    return (
      lead.name.toLowerCase().includes(q) ||
      lead.email.toLowerCase().includes(q) ||
      lead.message.toLowerCase().includes(q)
    );
  });
}

/** Count of live leads per status, for the filter chips. */
export function statusCounts(leads: Lead[]): Record<StatusFilter, number> {
  const counts: Record<StatusFilter, number> = {
    Todos: leads.length,
    Nuevo: 0,
    Contactado: 0,
    Cerrado: 0,
  };
  for (const lead of leads) counts[lead.status] += 1;
  return counts;
}
