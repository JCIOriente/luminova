import { ALLY_CATEGORIES, type AllyCategory, type AllyShowcaseItem } from "@luminova/types/engine";

// The logo backs a public <img> on the no-auth site, and the source `allies` doc is
// writable by Admin/Membership. logoUrl is only ever set from a Firebase Storage
// upload (uploadAllyLogo → getDownloadURL), so constrain it to the Storage hosts —
// this blocks an insider from pointing the public projection at an arbitrary URL
// (tracking pixel / off-origin fetch) via a direct Firestore write.
const ALLOWED_LOGO_HOSTS = ["firebasestorage.googleapis.com", "storage.googleapis.com"];

function isStorageLogoUrl(value: unknown): value is string {
  if (typeof value !== "string" || !URL.canParse(value)) return false;
  const url = new URL(value);
  return url.protocol === "https:" && ALLOWED_LOGO_HOSTS.includes(url.hostname);
}

/**
 * Project a raw ally doc into a curated public AllyShowcaseItem, or null when it is
 * not publicly showable (soft-deleted, or missing logo/category). Only a Firebase
 * Storage https logo URL is exposed — any other value projects null.
 */
export function projectAlly(id: string, data: Record<string, unknown>): AllyShowcaseItem | null {
  if (data.active !== true || data.deletedAt != null) return null;
  const name = data.companyName;
  if (typeof name !== "string" || name.length === 0) return null;
  if (!isStorageLogoUrl(data.logoUrl)) return null;
  const logoUrl = data.logoUrl;
  const category = data.category;
  if (!ALLY_CATEGORIES.includes(category as AllyCategory)) return null;
  return { id, name, logoUrl, category: category as AllyCategory };
}
