import type { Timestamp } from "./timestamp.js";
import type { AreaOfOpportunity, InitiativeImpact } from "./initiative.js";
import type { InitiativeKind } from "./activity.js";

export interface ShowcasePerson {
  name: string;
}

export interface ShowcasePhoto {
  id: string;
  url: string;
  caption: string | null;
}

export interface ShowcaseTeam {
  director: ShowcasePerson | null;
  coDirectors: ShowcasePerson[];
  members: ShowcasePerson[];
}

/**
 * Curated public projection of a completed initiative, written by beacon into the
 * `showcase` collection (read: true, write: false). Member ids are resolved to
 * display names; no raw initiative/member fields leak. `completedAt` == the
 * initiative's `finalReport.filedAt`.
 */
export interface ShowcaseItem {
  id: string;
  kind: InitiativeKind;
  title: string;
  description: string;
  category: AreaOfOpportunity;
  startDate: Timestamp;
  endDate: Timestamp;
  completedAt: Timestamp;
  impact: InitiativeImpact;
  photos: ShowcasePhoto[];
  team: ShowcaseTeam;
}
