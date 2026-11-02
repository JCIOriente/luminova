export const MEMBER_BIO_MAX = 180;
export const MEMBER_LINKEDIN_URL_MAX = 200;

/** Mirrored by selfProfileValid() in firestore.rules — member-self-lane.rules.test.ts fails
 *  if the two drift. Lives here, not in member-schema, because beacon re-checks it. */
export const PROFESSION_MAX_LENGTH = 80;

/** Byte-identical in `selfProfileValid`, pinned by member-self-lane.rules.test.ts. */
export const LINKEDIN_PROFILE_PATTERN =
  "^https://([a-z]{2,3}[.])?linkedin[.]com/in/[A-Za-z0-9_%.-]+/?$";
const LINKEDIN_PROFILE_URL = new RegExp(LINKEDIN_PROFILE_PATTERN);

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
