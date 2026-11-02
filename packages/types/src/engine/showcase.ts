import type { Timestamp } from "./timestamp.js";
import type { AreaOfOpportunity, InitiativeImpact } from "./initiative.js";
import type { InitiativeKind } from "./activity.js";

export interface ShowcasePerson {
  /** Absent on a doc last projected before public profiles existed. */
  id?: string;
  name: string;
  photoUrl: string | null;
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
  featured: boolean;
  title: string;
  description: string;
  category: AreaOfOpportunity;
  startDate: Timestamp;
  endDate: Timestamp;
  completedAt: Timestamp;
  impact: InitiativeImpact;
  photos: ShowcasePhoto[];
  /** Every roster member, for `array-contains`. Absent on a doc last projected before public
   *  profiles existed. */
  memberIds?: string[];
  team: ShowcaseTeam;
}
