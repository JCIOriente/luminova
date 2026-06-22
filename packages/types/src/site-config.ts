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

export const LINKTREE_ICONS = [
  "user",
  "globe",
  "folder",
  "calendar",
  "mail",
  "megaphone",
  "handshake",
  "heart",
  "target",
  "compass",
  "briefcase",
  "spark",
  "linkedin",
  "whatsapp",
  "youtube",
] as const;
export type LinktreeIcon = (typeof LINKTREE_ICONS)[number];

export const LINKTREE_SOCIAL_PLATFORMS = [
  "instagram",
  "facebook",
  "tiktok",
  "linkedin",
  "whatsapp",
  "youtube",
] as const;
export type LinktreeSocialPlatform = (typeof LINKTREE_SOCIAL_PLATFORMS)[number];

export interface LinktreeLink {
  id: string;
  icon: LinktreeIcon;
  title: string;
  description: string;
  url: string;
  isPrimary: boolean;
  badge?: string;
  active: boolean;
}

export interface LinktreeSocial {
  platform: LinktreeSocialPlatform;
  url: string;
}

export interface SiteLinktree {
  handle: string;
  tagline: string;
  taglineAccent: string;
  links: LinktreeLink[];
  socials: LinktreeSocial[];
}

// Footer + contact-page social links. Intentionally separate from
// SiteLinktree.socials, which powers the standalone /enlaces page and carries
// its own ordered, larger platform set.
export interface SiteSocials {
  instagram: string;
  facebook: string;
  tiktok: string;
  linkedin: string;
}

export interface SiteContact {
  email: string;
  location: string;
  meetingSchedule: string;
  mapUrl: string;
  socials: SiteSocials;
  links: SiteLink[];
}

export interface SiteHero {
  motto: string;
  submotto: string;
}

export interface SiteConfig {
  version: number;
  updatedAt: Timestamp;
  hero: SiteHero;
  stats: SiteStats;
  timeline: SiteTimelineEntry[];
  mvv: { mision: string; vision: string; valores: string };
  reasons: SiteReason[];
  contact: SiteContact;
  linktree?: SiteLinktree;
}
