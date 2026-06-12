import {
  AREAS_OF_OPPORTUNITY,
  type AreaOfOpportunity,
  type InitiativeImpact,
  type InitiativeKind,
  type Photo,
  type ShowcaseItem,
  type ShowcasePerson,
  type ShowcasePhoto,
} from "@luminova/types/engine";
import { isCleanId } from "../award-points/ids.js";
import { hasToMillis } from "../firestore-util.js";

function parseRoster(data: Record<string, unknown>): {
  directorId?: string;
  coDirectorIds?: string[];
  teamIds?: string[];
} {
  return (data.roster ?? {}) as {
    directorId?: string;
    coDirectorIds?: string[];
    teamIds?: string[];
  };
}

function asPhotos(v: unknown): ShowcasePhoto[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(
      (p): p is Photo =>
        typeof p === "object" && p !== null && typeof (p as Photo).url === "string",
    )
    .map((p) => ({
      id: typeof p.id === "string" ? p.id : "",
      url: p.url,
      caption: typeof p.caption === "string" ? p.caption : null,
    }));
}

function asImpact(v: unknown): InitiativeImpact | null {
  const i = (v ?? null) as {
    personsImpacted?: unknown;
    volunteers?: unknown;
    closingSummary?: unknown;
    custom?: unknown;
  } | null;
  if (!i || typeof i.personsImpacted !== "number" || typeof i.volunteers !== "number") return null;
  if (typeof i.closingSummary !== "string") return null;
  return {
    personsImpacted: i.personsImpacted,
    volunteers: i.volunteers,
    closingSummary: i.closingSummary,
    custom: Array.isArray(i.custom)
      ? i.custom
          .filter((c) => typeof c === "object" && c !== null)
          .map((c) => ({
            label: String((c as { label?: unknown }).label ?? ""),
            value: String((c as { value?: unknown }).value ?? ""),
          }))
      : [],
  };
}

function person(id: string, resolve: (id: string) => string | null): ShowcasePerson | null {
  const name = resolve(id);
  return name ? { name } : null;
}

/**
 * Project a raw initiative doc into a curated ShowcaseItem, or null when it is not
 * a completed initiative (status != Finalizado, or impact/finalReport absent) — the
 * trigger deletes any stale showcase doc on null.
 */
export function projectInitiative(
  kind: InitiativeKind,
  id: string,
  data: Record<string, unknown>,
  resolve: (memberId: string) => string | null,
): ShowcaseItem | null {
  if (!isProjectable(data)) return null;
  const impact = asImpact(data.impact);
  if (!impact) return null;
  const finalReport = data.finalReport as { filedAt?: unknown };
  if (!hasToMillis(finalReport.filedAt)) return null;
  if (!AREAS_OF_OPPORTUNITY.includes(data.category as AreaOfOpportunity)) return null;
  if (!hasToMillis(data.startDate) || !hasToMillis(data.endDate)) return null;

  const roster = parseRoster(data);
  return {
    id,
    kind,
    title: typeof data.title === "string" ? data.title : "",
    description: typeof data.description === "string" ? data.description : "",
    category: data.category as AreaOfOpportunity,
    startDate: data.startDate,
    endDate: data.endDate,
    completedAt: finalReport.filedAt,
    impact,
    photos: asPhotos(data.photos),
    team: {
      director: roster.directorId ? person(roster.directorId, resolve) : null,
      coDirectors: (roster.coDirectorIds ?? [])
        .map((cid) => person(cid, resolve))
        .filter((p): p is ShowcasePerson => p !== null),
      members: (roster.teamIds ?? [])
        .map((tid) => person(tid, resolve))
        .filter((p): p is ShowcasePerson => p !== null),
    },
  };
}

/** All roster ids that need name resolution (director + co-directors + team). */
export function rosterMemberIds(data: Record<string, unknown>): string[] {
  const r = parseRoster(data);
  return [
    ...(r.directorId ? [r.directorId] : []),
    ...(r.coDirectorIds ?? []),
    ...(r.teamIds ?? []),
  ].filter(isCleanId);
}

/** Cheap eligibility check: only completed initiatives with impact + filed report are projected. */
export function isProjectable(data: Record<string, unknown>): boolean {
  return (
    data.status === "Finalizado" &&
    data.impact != null &&
    (data.finalReport as { filedAt?: unknown } | null)?.filedAt != null
  );
}
