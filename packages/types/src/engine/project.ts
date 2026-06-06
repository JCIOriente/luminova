import type { FinalReport, InitiativeRoster, InitiativeStatus } from "./initiative.js";

/** Project — distinct from Program. Engine-minimal; the rich dossier model is C1. */
export interface Project {
  id: string;
  termId: string;
  title: string;
  roster: InitiativeRoster;
  finalReport: FinalReport | null;
  status: InitiativeStatus;
}
