import { siteConfigDocSchema } from "@luminova/types";
import { issuesToBrandError } from "./load-profile.ts";
import { SITE_CONTENT_FILE, editSiteContent } from "./site-content.ts";

// Kept apart from site-content.ts: the Node seeds import that file and must not load
// @luminova/types, whose runtime entry is its built dist.
const siteContentSchema = siteConfigDocSchema.omit({ version: true, updatedAt: true });

export type SiteContent = ReturnType<typeof siteContentSchema.parse>;

export function parseSiteContent(raw: unknown, slug: string): SiteContent {
  const parsed = siteContentSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  throw issuesToBrandError(`brand/${slug}/${SITE_CONTENT_FILE}`, parsed.error.issues, [
    editSiteContent(slug),
  ]);
}
