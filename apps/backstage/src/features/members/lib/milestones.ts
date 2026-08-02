import type { Member } from "@luminova/types";
import { daysUntilNextAnniversary, formatDayMonth } from "@luminova/utils/datetime";

export type UpcomingBirthday = { id: string; name: string; label: string; days: number };

/** How many upcoming birthdays every surface shows (/me + the board dashboard). The two
 *  lists differ in membership on purpose — /me excludes you, the chapter dashboard does
 *  not — but their LENGTH is one constant so they can't drift. */
export const UPCOMING_BIRTHDAY_LIMIT = 3;

/** "hoy" / "mañana" / "en N días" — shared by /me and the board dashboard list. */
export function inDaysEs(days: number): string {
  if (days === 0) return "hoy";
  if (days === 1) return "mañana";
  return `en ${days} días`;
}

// Exposes day/month only (no birth year) — privacy: don't reveal a member's birth year.
export function upcomingBirthdays(
  members: Member[],
  // Omitted on the chapter-wide dashboard, which has no "self" to leave out.
  excludeId: string | undefined,
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
