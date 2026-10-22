// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderRobots, renderSitemap } from "./seo-files";

const indexHtml = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const ORIGIN = "https://example.org";

// Redirect-only routes are not pages; dynamic ($param) routes need data to enumerate.
const NOT_IN_SITEMAP = new Set(["/programas"]);

function staticRoutePaths(): string[] {
  return readdirSync(new URL("./src/routes", import.meta.url))
    .filter((f) => f.endsWith(".tsx") && !f.includes(".test.") && !f.startsWith("__"))
    .filter((f) => !f.includes("$"))
    .map((f) => {
      const segments = f
        .replace(/\.tsx$/, "")
        .split(".")
        .filter((s) => s !== "index");
      return `/${segments.join("/")}`;
    });
}

describe("index.html", () => {
  it("carries no chapter value: every brand field is a placeholder", () => {
    expect(indexHtml).not.toMatch(
      /jcioriente|JCI Oriente|Santa Cruz|Cámara Junior|og-image-v3|#0097D7/,
    );
    for (const token of [
      "__LANG__",
      "__THEME_COLOR__",
      "__SEO_DESCRIPTION__",
      "__BRAND_TITLE__",
      "__BRAND_NAME__",
      "__OG_LOCALE__",
      "__OG_TITLE__",
      "__OG_DESCRIPTION__",
      "__OG_IMAGE_ALT__",
      "__TWITTER_DESCRIPTION__",
      '"__SITE_URL__/"',
    ]) {
      expect(indexHtml).toContain(token);
    }
  });

  it("points every share-image tag at the hashed OG image", () => {
    const shareImages = indexHtml.match(
      /(og:image|og:image:secure_url|twitter:image)"\s+content="[^"]*"/g,
    );
    expect(shareImages).toEqual([
      'og:image" content="__SITE_URL__/__OG_IMAGE__"',
      'og:image:secure_url" content="__SITE_URL__/__OG_IMAGE__"',
      'twitter:image" content="__SITE_URL__/__OG_IMAGE__"',
    ]);
  });
});

describe("sitemap.xml and robots.txt", () => {
  const locs = [...renderSitemap(ORIGIN).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

  it("point every URL at the site origin", () => {
    expect(locs.length).toBeGreaterThan(0);
    expect(locs.every((loc) => loc?.startsWith(`${ORIGIN}/`))).toBe(true);
    expect(renderRobots(ORIGIN)).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
  });

  it("lists every static page route", () => {
    const expected = staticRoutePaths().filter((p) => !NOT_IN_SITEMAP.has(p));
    expect(expected).toContain("/impacto");
    expect(locs.map((loc) => loc?.slice(ORIGIN.length)).sort()).toEqual(expected.sort());
  });
});
