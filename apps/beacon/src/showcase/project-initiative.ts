import { Timestamp } from "firebase-admin/firestore";
import {
  AREAS_OF_OPPORTUNITY,
  type AreaOfOpportunity,
  type InitiativeImpact,
  type InitiativeKind,
  type Photo,
  type ShowcaseItem,
  type ShowcasePerson,
} from "@luminova/types/engine";

function isTimestamp(v: unknown): v is Timestamp {
  return typeof (v as { toMillis?: unknown })?.toMillis === "function";
}

function asPhotos(v: unknown): Photo[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (p): p is Photo =>
      typeof p === "object" &&
      p !== null &&
      typeof (p as Photo).url === "string" &&
      isTimestamp((p as Photo).uploadedAt),
  );
}

function asImpact(v: unknown): InitiativeImpact | null {
  const i = v as InitiativeImpact | null;
  if (!i || typeof i.personsImpacted !== "number" || typeof i.volunteers !== "number") return null;
  if (typeof i.closingSummary !== "string") return null;
  return {
    personsImpacted: i.personsImpacted,
    volunteers: i.volunteers,
    closingSummary: i.closingSummary,
    custom: Array.isArray(i.custom) ? i.custom : [],
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
  if (data.status !== "Finalizado") return null;
  const impact = asImpact(data.impact);
  if (!impact) return null;
  const finalReport = data.finalReport as { filedAt?: unknown } | null | undefined;
  if (!finalReport || !isTimestamp(finalReport.filedAt)) return null;
  if (!AREAS_OF_OPPORTUNITY.includes(data.category as AreaOfOpportunity)) return null;
  if (!isTimestamp(data.startDate) || !isTimestamp(data.endDate)) return null;

  const roster = (data.roster ?? {}) as {
    directorId?: string;
    coDirectorIds?: string[];
    teamIds?: string[];
  };
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
  const r = (data.roster ?? {}) as {
    directorId?: string;
    coDirectorIds?: string[];
    teamIds?: string[];
  };
  return [
    ...(r.directorId ? [r.directorId] : []),
    ...(r.coDirectorIds ?? []),
    ...(r.teamIds ?? []),
  ];
}
