export const ALLY_CATEGORIES = [
  "University",
  "PublicInstitution",
  "Organization",
  "Company",
] as const;
export type AllyCategory = (typeof ALLY_CATEGORIES)[number];

export const ALLY_CATEGORY_LABELS: Record<AllyCategory, string> = {
  University: "Universidades",
  PublicInstitution: "Instituciones públicas",
  Organization: "Organizaciones",
  Company: "Empresas",
};

/** Curated public projection of an ally. Beacon writes it; world-read. */
export interface AllyShowcaseItem {
  id: string;
  name: string;
  logoUrl: string;
  category: AllyCategory;
}
