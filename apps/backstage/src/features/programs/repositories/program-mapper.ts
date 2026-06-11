import { Timestamp } from "firebase/firestore";
import type { ProgramInput } from "@luminova/types";

/** `date` input ("YYYY-MM-DD") → Timestamp at midnight UTC (round-trips TZ-stable). */
function toDateTimestamp(value: string): Timestamp {
  return Timestamp.fromDate(new Date(`${value}T00:00:00Z`));
}

export function toProgramCreateDoc(data: ProgramInput, termId: string) {
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

/** Form-owned fields only — photos/impact/finalReport/directionUids are owned elsewhere. */
export function toProgramUpdateDoc(data: ProgramInput) {
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
