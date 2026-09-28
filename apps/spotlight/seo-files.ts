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

export function renderIndexHtml(html: string, origin: string): string {
  return html.replaceAll(SITE_URL_PLACEHOLDER, origin);
}

export function renderSitemap(origin: string): string {
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

export function renderRobots(origin: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`;
}

// sitemap.xml and robots.txt need absolute URLs, so they are generated rather than
// shipped from public/ — otherwise a domain switch leaves them pointing at the old host.
export function seoFiles(siteUrl: string): Plugin {
  const origin = normalizeSiteUrl(siteUrl);
  const files = [
    { fileName: "sitemap.xml", contentType: "application/xml", source: renderSitemap(origin) },
    { fileName: "robots.txt", contentType: "text/plain", source: renderRobots(origin) },
  ];
  return {
    name: "seo-files",
    transformIndexHtml: {
      order: "pre",
      handler: (html) => renderIndexHtml(html, origin),
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = files.find((f) => req.url === `/${f.fileName}`);
        if (!file) return next();
        res.setHeader("Content-Type", file.contentType);
        res.end(file.source);
      });
    },
    generateBundle() {
      for (const { fileName, source } of files) {
        this.emitFile({ type: "asset", fileName, source });
      }
    },
  };
}
