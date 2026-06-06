import type { Timestamp } from "firebase/firestore";

export const INITIATIVE_STATUSES = ["Planificacion", "EnEjecucion", "Finalizado"] as const;
export type InitiativeStatus = (typeof INITIATIVE_STATUSES)[number];

export interface InitiativeRoster {
  directorId: string;
  coDirectorId: string | null;
  teamIds: string[];
}

/** Director's final report — the confirmation gate for all child-activity points. */
export interface FinalReport {
  filedAt: Timestamp;
  filedBy: string;
}
