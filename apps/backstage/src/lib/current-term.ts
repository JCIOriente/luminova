/** The active term id. v1 convention: the term doc id IS the calendar year. */
export function currentTermId(now: Date = new Date()): string {
  return String(now.getFullYear());
}
