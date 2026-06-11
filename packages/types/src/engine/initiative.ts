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
