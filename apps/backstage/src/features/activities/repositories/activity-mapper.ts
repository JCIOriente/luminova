import { Timestamp } from "firebase/firestore";
import type { ActivityInput } from "@luminova/types";

/** `datetime-local` value ("YYYY-MM-DDTHH:mm") → Timestamp at that wall-clock in
 *  UTC, so the stored instant round-trips with the input regardless of TZ. */
function toTimestamp(value: string): Timestamp {
  return Timestamp.fromDate(new Date(`${value}:00Z`));
}

export function toActivityCreateDoc(data: ActivityInput, termId: string) {
  return {
    termId,
    title: data.title,
    description: data.description === "" ? null : data.description,
    location: data.location === "" ? null : data.location,
    category: data.category,
    parentType: data.parentType,
    parentId: data.parentId,
    organizers: { directorId: data.directorId, coDirectorIds: data.coDirectorIds },
    startAt: toTimestamp(data.startAt),
    endAt: data.endAt === null ? null : toTimestamp(data.endAt),
    photos: [],
    status: "Programada" as const,
  };
}

/** Editable fields for an existing activity — no termId/status/photos churn. */
export function toActivityUpdateDoc(data: ActivityInput) {
  return {
    title: data.title,
    description: data.description === "" ? null : data.description,
    location: data.location === "" ? null : data.location,
    category: data.category,
    parentType: data.parentType,
    parentId: data.parentId,
    organizers: { directorId: data.directorId, coDirectorIds: data.coDirectorIds },
    startAt: toTimestamp(data.startAt),
    endAt: data.endAt === null ? null : toTimestamp(data.endAt),
  };
}
