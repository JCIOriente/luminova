import type { FinalReport, InitiativeRoster, InitiativeStatus } from "./initiative.js";

/** Program — distinct from Project (different core + distinct point codes). Engine-minimal; C1 extends. */
export interface Program {
  id: string;
  termId: string;
  title: string;
  roster: InitiativeRoster;
  finalReport: FinalReport | null;
  status: InitiativeStatus;
}
