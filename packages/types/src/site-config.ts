import type { Timestamp } from "firebase/firestore";

export interface SiteStats {
  programCount: number;
  countries: string;
  membersWorldwide: string;
  nationalAwards: number;
  efficiencyPct: number;
  standoutOrg: { year: string; title: string };
}

export interface SiteTimelineEntry {
  year: string;
  title: string;
  description: string;
}

export interface SiteReason {
  number: string;
  title: string;
  body: string;
}

export interface SiteLink {
  label: string;
  url: string;
}

export interface SiteContact {
  email: string;
  location: string;
  meetingSchedule: string;
  links: SiteLink[];
}

export interface SiteConfig {
  version: number;
  updatedAt: Timestamp;
  stats: SiteStats;
  allies: string[];
  timeline: SiteTimelineEntry[];
  mvv: { mision: string; vision: string; valores: string };
  reasons: SiteReason[];
  contact: SiteContact;
}
