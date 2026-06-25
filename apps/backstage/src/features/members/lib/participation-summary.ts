import type { InitiativeKind, Participation } from "@luminova/types";

export interface EnrichedParticipation extends Participation {
  /** Resolved activity title, or null when the source activity is unavailable. */
  activityTitle: string | null;
  /** Resolved parent program/project title, or null when there is no parent. */
  parentTitle: string | null;
}

export interface ParticipationProject {
  id: string;
  title: string;
  kind: InitiativeKind;
  activityCount: number;
}

export interface ParticipationSummary {
  rows: EnrichedParticipation[];
  /** Distinct activities the member participated in. */
  activityCount: number;
  /** Distinct parent programs/projects across those activities. */
  projects: ParticipationProject[];
}

interface ActivityRef {
  id: string;
  title: string;
}

interface InitiativeRef {
  id: string;
  title: string;
  kind: InitiativeKind;
}

/**
 * Joins a member's participation ledger against the term's activities and
 * initiatives so the panel can show which projects and activities the member
 * took part in. Pure — no Firestore access; callers pass the already-fetched
 * term catalogs.
 */
export function summarizeParticipations(
  rows: Participation[],
  activities: ActivityRef[],
  initiatives: InitiativeRef[],
): ParticipationSummary {
  const activityById = new Map(activities.map((a) => [a.id, a]));
  const initiativeById = new Map(initiatives.map((i) => [i.id, i]));

  const enriched = rows.map<EnrichedParticipation>((row) => ({
    ...row,
    activityTitle: activityById.get(row.activityId)?.title ?? null,
    parentTitle: row.parentId ? (initiativeById.get(row.parentId)?.title ?? null) : null,
  }));

  const distinctActivities = new Set(rows.map((r) => r.activityId));

  const projects = new Map<string, ParticipationProject>();
  const seenPerProject = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.parentId) continue;
    const initiative = initiativeById.get(row.parentId);
    if (!initiative) continue;
    const seen = seenPerProject.get(row.parentId) ?? new Set<string>();
    const isNewActivity = !seen.has(row.activityId);
    seen.add(row.activityId);
    seenPerProject.set(row.parentId, seen);

    const existing = projects.get(row.parentId);
    if (existing) {
      if (isNewActivity) existing.activityCount += 1;
    } else {
      projects.set(row.parentId, {
        id: initiative.id,
        title: initiative.title,
        kind: initiative.kind,
        activityCount: 1,
      });
    }
  }

  return {
    rows: enriched,
    activityCount: distinctActivities.size,
    projects: [...projects.values()].sort((a, b) => a.title.localeCompare(b.title, "es")),
  };
}
