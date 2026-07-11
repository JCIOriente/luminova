import type { Member } from "@luminova/types";
import { daysUntilNextAnniversary, formatDayMonth } from "@luminova/utils/datetime";

export type UpcomingBirthday = { id: string; name: string; label: string; days: number };

// Exposes day/month only (no birth year) — privacy: don't reveal a member's birth year.
export function upcomingBirthdays(
  members: Member[],
  excludeId: string,
  now: Date,
  limit: number,
): UpcomingBirthday[] {
  return members
    .filter((m) => m.active && m.id !== excludeId)
    .map((m) => ({
      id: m.id,
      name: m.name,
      label: formatDayMonth(m.birthdate),
      days: daysUntilNextAnniversary(m.birthdate, now),
    }))
    .sort((a, b) => a.days - b.days || a.name.localeCompare(b.name, "es"))
    .slice(0, limit);
}
