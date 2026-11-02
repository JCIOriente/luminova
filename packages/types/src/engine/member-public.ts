export const MEMBER_BIO_MAX = 180;
export const MEMBER_LINKEDIN_URL_MAX = 200;

/** Kept in step with `selfProfileValid` in firestore.rules. */
const LINKEDIN_PROFILE_URL = /^https:\/\/(www\.)?linkedin\.com\/in\/[A-Za-z0-9_%.-]+\/?$/;

/** Takes `unknown` because beacon reads raw admin-SDK data at a public trust boundary. */
export function isLinkedinProfileUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= MEMBER_LINKEDIN_URL_MAX &&
    LINKEDIN_PROFILE_URL.test(value)
  );
}

export const MEMBER_PROJECT_ROLES = ["Director", "CoDirector", "Team"] as const;
export type MemberProjectRole = (typeof MEMBER_PROJECT_ROLES)[number];

export interface MemberCareerEntry {
  year: string;
  /** Gender-aware Spanish cargo title. */
  title: string;
}

export interface MemberProjectEntry {
  id: string;
  title: string;
  year: number;
  role: MemberProjectRole;
  personsImpacted: number;
}

/** Curated public projection of a member's career. Beacon writes it; world-read.
 *  Public fields only: no contact details, points or grants. */
export interface MemberShowcaseItem {
  id: string;
  name: string;
  /** Storage download URL pinned to this member's own object, or null for initials. */
  portraitUrl: string | null;
  profession: string | null;
  joinYear: number | null;
  bio: string | null;
  linkedinUrl: string | null;
  isPastPresident: boolean;
  /** Most recent first. */
  career: MemberCareerEntry[];
  /** Most recent first. */
  projects: MemberProjectEntry[];
}
