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
import { isDeepStrictEqual } from "node:util";
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

/**
 * A showcase id usable as a flattened gallery key: path-safe (`isCleanId`) AND free of
 * the `:` separator, so a client-set photo id can't forge a colliding
 * `${activityId}:${photoId}` key. Applied to both photo ids and contributing activity ids.
 */
function isGalleryId(id: unknown): id is string {
  return isCleanId(id) && !id.includes(":");
}

function asPhotos(v: unknown): ShowcasePhoto[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(
      (p): p is Photo =>
        typeof p === "object" &&
        p !== null &&
        isGalleryId((p as Photo).id) &&
        typeof (p as Photo).url === "string" &&
        (p as Photo).url.length > 0,
    )
    .map((p) => ({
      id: p.id,
      url: p.url,
      caption: typeof p.caption === "string" ? p.caption : null,
    }));
}

/**
 * Flatten the photos of executed child activities into namespaced ShowcasePhotos.
 * Only `status === "Ejecutada"` activities whose `parentType` matches the projected
 * `kind` contribute; ids become `${activityId}:${photoId}` so flattened gallery keys
 * never collide with the initiative's own photos or across activities. The `:`
 * separator is gallery-key-only — these ids are never used as a Firestore path or
 * composite doc id. `activityId` is `isGalleryId`-gated for the same path-safety
 * discipline as roster ids.
 */
export function activityShowcasePhotos(
  kind: InitiativeKind,
  docs: { id: string; data: Record<string, unknown> }[],
): ShowcasePhoto[] {
  return docs
    .filter((d) => isGalleryId(d.id) && d.data.parentType === kind && d.data.status === "Ejecutada")
    .flatMap((d) => asPhotos(d.data.photos).map((p) => ({ ...p, id: `${d.id}:${p.id}` })));
}

export interface ShowcaseParentRef {
  kind: InitiativeKind;
  id: string;
}

// The only activity fields the showcase projection consumes (activityParentRefs +
// activityShowcasePhotos). awardPoints mirrors `hasCheckIns` onto activities on
// EVERY check-in write, so onActivityWritten must be able to tell a
// projection-relevant edit from that mirror churn and skip the re-projection.
const ACTIVITY_PROJECTION_FIELDS = ["parentType", "parentId", "status", "photos"] as const;

/** True when an activity update left every projection-consumed field deep-equal —
 *  the showcase output cannot have changed, so re-projection can be skipped.
 *  Creates and deletes (a missing side) always count as changed. */
export function activityProjectionUnchanged(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): boolean {
  if (!before || !after) return false;
  return ACTIVITY_PROJECTION_FIELDS.every((f) => isDeepStrictEqual(before[f], after[f]));
}

/**
 * Distinct, path-safe parent initiatives to re-project for an activity write.
 * Looks at both the before- and after-doc so a delete reconciles the old parent and
 * a parent-change re-projects both the source and destination.
 */
export function activityParentRefs(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): ShowcaseParentRef[] {
  const refs: ShowcaseParentRef[] = [];
  const seen = new Set<string>();
  for (const data of [before, after]) {
    if (!data) continue;
    const kind = data.parentType;
    const id = data.parentId;
    if ((kind !== "Program" && kind !== "Project") || !isCleanId(id)) continue;
    const key = `${kind}/${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ kind, id });
  }
  return refs;
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

/**
 * Build a public ShowcasePerson from raw member fields, or null when the member has
 * no usable display name. An empty/non-string name is dropped (no blank credit on the
 * public page). `profilePicture` is member-controlled and rendered on a no-auth page,
 * so it is exposed only when it is an https URL — any other value projects null.
 *
 * KNOWN STALENESS (follow-up): the name here is a SNAPSHOT. This projection re-runs only
 * on an initiative/activity write, never on a members/{id} write, so a /me self-rename
 * does not rewrite past team credits — it self-heals on the next initiative edit.
 * boardShowcase, by contrast, IS member-write-driven and updates immediately. Closing the
 * gap needs a rename-gated fan-out in the members trigger (query programs+projects by
 * directorId / coDirectorIds / teamIds and re-project each hit); tracked separately.
 *
 * The bar here stays "is this renderable" — deliberately weaker than memberName's form
 * pattern — because this projects LEGACY institutional names beacon does not control.
 * A stricter bar would silently un-publish an existing credit.
 */
export function showcasePerson(name: unknown, photoUrl: unknown): ShowcasePerson | null {
  if (typeof name !== "string" || name.length === 0) return null;
  return {
    name,
    photoUrl: typeof photoUrl === "string" && photoUrl.startsWith("https://") ? photoUrl : null,
  };
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
  resolve: (memberId: string) => ShowcasePerson | null,
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
    featured: data.featured === true,
    title: typeof data.title === "string" ? data.title : "",
    description: typeof data.description === "string" ? data.description : "",
    category: data.category as AreaOfOpportunity,
    startDate: data.startDate,
    endDate: data.endDate,
    completedAt: finalReport.filedAt,
    impact,
    photos: asPhotos(data.photos),
    team: {
      director: roster.directorId ? resolve(roster.directorId) : null,
      coDirectors: (roster.coDirectorIds ?? [])
        .map((cid) => resolve(cid))
        .filter((p): p is ShowcasePerson => p !== null),
      members: (roster.teamIds ?? [])
        .map((tid) => resolve(tid))
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
