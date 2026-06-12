import { Timestamp, serverTimestamp } from "firebase/firestore";
import type { InitiativeCore, InitiativeInput, InitiativeImpactInput } from "@luminova/types";

/** `date` input ("YYYY-MM-DD") → Timestamp at midnight UTC (round-trips TZ-stable). */
function toDateTimestamp(value: string): Timestamp {
  return Timestamp.fromDate(new Date(`${value}T00:00:00Z`));
}

export function toInitiativeCreateDoc(data: InitiativeInput, termId: string) {
  return {
    termId,
    title: data.title,
    description: data.description,
    category: data.category,
    startDate: toDateTimestamp(data.startDate),
    endDate: toDateTimestamp(data.endDate),
    roster: data.roster,
    status: data.status,
    photos: [],
    impact: null,
    finalReport: null,
    directionUids: [],
  };
}

/** The completion wizard's atomic trio — written by both initiative repositories. */
export function toInitiativeCompleteDoc(impact: InitiativeImpactInput, uid: string) {
  return {
    status: "Finalizado",
    impact,
    finalReport: { filedAt: serverTimestamp(), filedBy: uid },
  };
}

/** Form-owned fields only — photos/impact/finalReport/directionUids are owned elsewhere. */
export function toInitiativeUpdateDoc(data: InitiativeInput) {
  return {
    title: data.title,
    description: data.description,
    category: data.category,
    startDate: toDateTimestamp(data.startDate),
    endDate: toDateTimestamp(data.endDate),
    roster: data.roster,
    status: data.status,
  };
}

export function initiativeToInput(p: InitiativeCore): Partial<InitiativeInput> {
  return {
    title: p.title,
    description: p.description,
    category: p.category,
    startDate: p.startDate.toDate().toISOString().slice(0, 10),
    endDate: p.endDate.toDate().toISOString().slice(0, 10),
    roster: p.roster,
    status: p.status,
  };
}
