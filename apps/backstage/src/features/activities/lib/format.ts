import type { Timestamp } from "@luminova/types";

const DATE_TIME = new Intl.DateTimeFormat("es-BO", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatActivityDateTime(ts: Timestamp): string {
  return DATE_TIME.format(ts.toDate());
}
