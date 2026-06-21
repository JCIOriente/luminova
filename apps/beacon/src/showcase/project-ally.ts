import { ALLY_CATEGORIES, type AllyCategory, type AllyShowcaseItem } from "@luminova/types/engine";

/**
 * Project a raw ally doc into a curated public AllyShowcaseItem, or null when it is
 * not publicly showable (soft-deleted, or missing logo/category). The logo backs a
 * public <img>, so only an https URL is exposed — any other value projects null.
 */
export function projectAlly(id: string, data: Record<string, unknown>): AllyShowcaseItem | null {
  if (data.active !== true || data.deletedAt != null) return null;
  const name = data.companyName;
  if (typeof name !== "string" || name.length === 0) return null;
  const logoUrl = data.logoUrl;
  if (typeof logoUrl !== "string" || !logoUrl.startsWith("https://")) return null;
  const category = data.category;
  if (!ALLY_CATEGORIES.includes(category as AllyCategory)) return null;
  return { id, name, logoUrl, category: category as AllyCategory };
}
