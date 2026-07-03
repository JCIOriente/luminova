import { z } from "zod";
import { clientTimestampSchema } from "./client-timestamp-schema.js";
import { LINKTREE_ICONS, LINKTREE_SOCIAL_PLATFORMS } from "./site-config.js";
import type { SiteConfig } from "./site-config.js";

const siteStatsDocSchema = z.object({
  programCount: z.number(),
  countries: z.string(),
  membersWorldwide: z.string(),
  nationalAwards: z.number(),
  efficiencyPct: z.number(),
  standoutOrg: z.object({ year: z.string(), title: z.string() }),
});

const siteTimelineEntryDocSchema = z.object({
  year: z.string(),
  title: z.string(),
  description: z.string(),
});

const siteReasonDocSchema = z.object({
  number: z.string(),
  title: z.string(),
  body: z.string(),
});

const siteLinkDocSchema = z.object({
  label: z.string(),
  url: z.string(),
});

const siteSocialsDocSchema = z.object({
  instagram: z.string(),
  facebook: z.string(),
  tiktok: z.string(),
  linkedin: z.string(),
});

const siteContactDocSchema = z.object({
  email: z.string(),
  location: z.string(),
  meetingSchedule: z.string(),
  mapUrl: z.string(),
  socials: siteSocialsDocSchema,
  links: z.array(siteLinkDocSchema),
});

const siteHeroDocSchema = z.object({
  motto: z.string(),
  submotto: z.string(),
});

const linktreeLinkDocSchema = z.object({
  id: z.string(),
  icon: z.enum(LINKTREE_ICONS),
  title: z.string(),
  description: z.string(),
  url: z.string(),
  isPrimary: z.boolean(),
  badge: z.string().optional(),
  active: z.boolean(),
});

const linktreeSocialDocSchema = z.object({
  platform: z.enum(LINKTREE_SOCIAL_PLATFORMS),
  url: z.string(),
});

const siteLinktreeDocSchema = z.object({
  handle: z.string(),
  tagline: z.string(),
  taglineAccent: z.string(),
  links: z.array(linktreeLinkDocSchema),
  socials: z.array(linktreeSocialDocSchema),
});

export const siteConfigDocSchema = z.object({
  version: z.number(),
  updatedAt: clientTimestampSchema,
  hero: siteHeroDocSchema.default({ motto: "", submotto: "" }),
  stats: siteStatsDocSchema,
  timeline: z.array(siteTimelineEntryDocSchema),
  mvv: z.object({ mision: z.string(), vision: z.string(), valores: z.string() }),
  reasons: z.array(siteReasonDocSchema),
  contact: siteContactDocSchema,
  linktree: siteLinktreeDocSchema.optional(),
}) satisfies z.ZodType<SiteConfig>;
