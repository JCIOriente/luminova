import type { Timestamp } from "./timestamp.js";

export const INITIATIVE_STATUSES = ["Planificacion", "EnEjecucion", "Finalizado"] as const;
export type InitiativeStatus = (typeof INITIATIVE_STATUSES)[number];

export interface InitiativeRoster {
  directorId: string;
  coDirectorIds: string[];
  teamIds: string[];
}

/** Director's final report — the confirmation gate for all child-activity points. */
export interface FinalReport {
  filedAt: Timestamp;
  filedBy: string;
}

export const AREAS_OF_OPPORTUNITY = [
  "DesarrolloIndividual",
  "DesarrolloComunitario",
  "NegociosEmprendimiento",
  "CooperacionInternacional",
] as const;
export type AreaOfOpportunity = (typeof AREAS_OF_OPPORTUNITY)[number];

export const AREA_OF_OPPORTUNITY_LABELS: Record<AreaOfOpportunity, string> = {
  DesarrolloIndividual: "Desarrollo Individual",
  DesarrolloComunitario: "Desarrollo Comunitario",
  NegociosEmprendimiento: "Negocios y Emprendimiento",
  CooperacionInternacional: "Cooperación Internacional",
};

export interface ImpactMetric {
  label: string;
  value: string;
}

/** Captured by the completion wizard; null until the initiative is Finalizado. */
export interface InitiativeImpact {
  personsImpacted: number;
  volunteers: number;
  custom: ImpactMetric[];
  closingSummary: string;
}

/** Shared with Activity. Metadata here; the binary lives in Storage. */
export interface Photo {
  id: string;
  url: string;
  caption: string | null;
  uploadedAt: Timestamp;
  uploadedBy: string;
}

/**
 * Shared core — Program and Project are this shape verbatim, but stay distinct
 * collections/entities (the engine and point codes distinguish them).
 * `directionUids` is engine-written (beacon mirrors roster direction member uids
 * for the firestore.rules direction branch); clients create it as [].
 */
export interface InitiativeCore {
  id: string;
  termId: string;
  title: string;
  description: string;
  category: AreaOfOpportunity;
  startDate: Timestamp;
  endDate: Timestamp;
  roster: InitiativeRoster;
  photos: Photo[];
  impact: InitiativeImpact | null;
  finalReport: FinalReport | null;
  status: InitiativeStatus;
  directionUids: string[];
  featured: boolean;
}
