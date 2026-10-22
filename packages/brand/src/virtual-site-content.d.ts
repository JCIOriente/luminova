declare module "virtual:luminova-brand/site-content" {
  /** The profile's site-content.json, validated at build time: the pre-Firestore fallback. */
  export const siteContent: Omit<import("@luminova/types").SiteConfig, "version" | "updatedAt">;
}
