declare module "*/site-config-seed-data.mjs" {
  export const SITE_CONFIG_CONTENT: Pick<
    import("@luminova/types").SiteConfig,
    "stats" | "timeline" | "mvv" | "reasons" | "contact"
  >;
}
