declare module "virtual:luminova-brand/site-content" {
  /** The site texts of the profile's brand.toml, validated at build time: the pre-Firestore fallback. */
  export const siteContent: Omit<import("@luminova/types").SiteConfig, "version" | "updatedAt">;
}
