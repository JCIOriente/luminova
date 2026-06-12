import type { Timestamp } from "@luminova/types/engine";

const numberFormatter = new Intl.NumberFormat("es-BO");

export function formatES(n: number): string {
  return numberFormatter.format(n);
}

const monthFormatter = new Intl.DateTimeFormat("es-BO", { month: "short" });
const monthYearFormatter = new Intl.DateTimeFormat("es-BO", {
  month: "short",
  year: "numeric",
});

function stripDot(s: string): string {
  return s.replace(/\.$/, "");
}

export function formatDateRange(start: Timestamp, end: Timestamp): string {
  const startDate = start.toDate();
  const endDate = end.toDate();
  const sameYear = startDate.getFullYear() === endDate.getFullYear();
  const endLabel = stripDot(monthYearFormatter.format(endDate));
  if (sameYear) {
    const startMonth = stripDot(monthFormatter.format(startDate));
    if (startDate.getMonth() === endDate.getMonth()) return endLabel;
    return `${startMonth} – ${endLabel}`;
  }
  const startLabel = stripDot(monthYearFormatter.format(startDate));
  return `${startLabel} – ${endLabel}`;
}
