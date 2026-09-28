import type { Plugin } from "vite";

export const SITE_URL_PLACEHOLDER = "__SITE_URL__";

const SITEMAP_ROUTES: ReadonlyArray<{ path: string; priority: string }> = [
  { path: "/", priority: "1.0" },
  { path: "/about", priority: "0.8" },
  { path: "/impacto", priority: "0.8" },
  { path: "/contact", priority: "0.7" },
  { path: "/linktree", priority: "0.6" },
  { path: "/privacidad", priority: "0.3" },
  { path: "/terminos", priority: "0.3" },
];

export function normalizeSiteUrl(siteUrl: string): string {
  const url = new URL(siteUrl);
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`SITE_URL must be a bare https origin, got "${siteUrl}"`);
  }
  return url.origin;
}

export function renderIndexHtml(html: string, siteUrl: string): string {
  return html.replaceAll(SITE_URL_PLACEHOLDER, normalizeSiteUrl(siteUrl));
}

export function renderSitemap(siteUrl: string): string {
  const origin = normalizeSiteUrl(siteUrl);
  const urls = SITEMAP_ROUTES.map(
    ({ path, priority }) =>
      `  <url><loc>${origin}${path}</loc><priority>${priority}</priority></url>`,
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}

export function renderRobots(siteUrl: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${normalizeSiteUrl(siteUrl)}/sitemap.xml\n`;
}

// sitemap.xml and robots.txt need absolute URLs, so they are generated rather than
// shipped from public/ — otherwise a domain switch leaves them pointing at the old host.
export function seoFiles(siteUrl: string): Plugin {
  return {
    name: "seo-files",
    transformIndexHtml: {
      order: "pre",
      handler: (html) => renderIndexHtml(html, siteUrl),
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: renderSitemap(siteUrl) });
      this.emitFile({ type: "asset", fileName: "robots.txt", source: renderRobots(siteUrl) });
    },
  };
}
