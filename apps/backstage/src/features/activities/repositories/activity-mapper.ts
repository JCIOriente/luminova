import { Timestamp } from "firebase/firestore";
import type { ActivityInput } from "@luminova/types";

/** `datetime-local` value ("YYYY-MM-DDTHH:mm") → Timestamp at that wall-clock in
 *  UTC, so the stored instant round-trips with the input regardless of TZ. */
function toTimestamp(value: string): Timestamp {
  return Timestamp.fromDate(new Date(`${value}:00Z`));
}

/** New activity document: form fields + term + system defaults. */
export function toActivityCreateDoc(data: ActivityInput, termId: string) {
  return {
    termId,
    category: data.category,
    parentType: data.parentType,
    parentId: data.parentId,
    organizers: { directorId: data.directorId, coDirectorId: null },
    startAt: toTimestamp(data.startAt),
    status: "Programada" as const,
  };
}
