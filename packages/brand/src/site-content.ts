import type { LinktreeIcon, LinktreeSocialPlatform, SiteConfig } from "@luminova/types";
import { z } from "zod";

// Only types come from @luminova/types: its runtime entry is its built dist, and the loader
// runs before any build (`prepare`, the Node seeds). The type checks below catch drift.

const LINKTREE_ICONS = [
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
] as const satisfies readonly LinktreeIcon[];

const LINKTREE_SOCIAL_PLATFORMS = [
  "instagram",
  "facebook",
  "tiktok",
  "linkedin",
  "whatsapp",
  "youtube",
] as const satisfies readonly LinktreeSocialPlatform[];

type Exactly<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const sameIcons: Exactly<(typeof LINKTREE_ICONS)[number], LinktreeIcon> = true;
const samePlatforms: Exactly<(typeof LINKTREE_SOCIAL_PLATFORMS)[number], LinktreeSocialPlatform> =
  true;
void sameIcons;
void samePlatforms;

const isEmail = (value: string) => z.email().safeParse(value).success;

/** An email address, or blank for none. */
export const emailOrBlank = z
  .string()
  .trim()
  .refine((value) => value === "" || isEmail(value), { message: "not an email address" });

const link = z.strictObject({ label: z.string(), url: z.string() });

/**
 * The site texts of brand.toml, the tables after the identity: the first content of the
 * public site and the seeds' `siteConfig/current`. Keys keep their Firestore names.
 */
export const siteContentTables = {
  hero: z
    .strictObject({ motto: z.string(), submotto: z.string() })
    .describe("The home page's opening line and the smaller line under it."),
  stats: z
    .strictObject({
      nationalOrganizations: z
        .int()
        .positive()
        .describe("Local organizations in the national federation."),
      programCount: z.number(),
      countries: z.string(),
      membersWorldwide: z.string(),
      nationalAwards: z.number(),
      efficiencyPct: z.number(),
      standoutOrg: z
        .strictObject({ year: z.string(), title: z.string() })
        .describe("The standout recognition the home page names."),
    })
    .describe("Numbers the home page states."),
  timeline: z
    .array(z.strictObject({ year: z.string(), title: z.string(), description: z.string() }))
    .describe("The history page, one [[timeline]] per milestone, oldest first."),
  mvv: z
    .strictObject({ mision: z.string(), vision: z.string(), valores: z.string() })
    .describe("Mission, vision and values."),
  reasons: z
    .array(z.strictObject({ number: z.string(), title: z.string(), body: z.string() }))
    .describe("Why join: one [[reasons]] per reason."),
  contact: z
    .strictObject({
      email: emailOrBlank.describe("The chapter's public email; blank shows none."),
      location: z.string(),
      meetingSchedule: z.string(),
      mapUrl: z.string(),
      whatsapp: z.string(),
      broadcastChannel: z.string(),
      socials: z.strictObject({
        instagram: z.string(),
        facebook: z.string(),
        tiktok: z.string(),
        linkedin: z.string(),
      }),
      links: z.array(link).describe("Links in the footer, one [[contact.links]] each."),
    })
    .describe("How to reach the chapter."),
  linktree: z
    .strictObject({
      handle: z.string(),
      tagline: z.string(),
      taglineAccent: z.string(),
      links: z.array(
        z.strictObject({
          id: z.string(),
          icon: z.enum(LINKTREE_ICONS),
          title: z.string(),
          description: z.string(),
          url: z.string(),
          isPrimary: z.boolean(),
          badge: z.string().optional(),
          active: z.boolean(),
        }),
      ),
      socials: z.array(
        z.strictObject({ platform: z.enum(LINKTREE_SOCIAL_PLATFORMS), url: z.string() }),
      ),
    })
    .describe("The /links page."),
};

type SiteContentFile = {
  [Table in keyof typeof siteContentTables]: z.infer<(typeof siteContentTables)[Table]>;
};

export type SiteContent = Omit<SiteConfig, "version" | "updatedAt">;

/** The site content the build embeds and the seeds write, in siteConfig's key order. */
export function toSiteContent(file: SiteContentFile): SiteContent {
  const { hero, stats, timeline, mvv, reasons, contact, linktree } = file;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- nationalOrganizations shares the table but is a brand value (virtual:luminova-brand)
  const { nationalOrganizations, ...siteStats } = stats;
  return { hero, stats: siteStats, timeline, mvv, reasons, contact, linktree };
}

// The seeds own these keys; hero and linktree are left to /config so a re-seed keeps edits.
export const SEEDED_SITE_CONTENT_KEYS = ["stats", "timeline", "mvv", "reasons", "contact"] as const;

type SeededKey = (typeof SEEDED_SITE_CONTENT_KEYS)[number];

export function pickSeededSiteContent(content: SiteContent): Pick<SiteContent, SeededKey> {
  const { stats, timeline, mvv, reasons, contact } = content;
  return { stats, timeline, mvv, reasons, contact };
}
