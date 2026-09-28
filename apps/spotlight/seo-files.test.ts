// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SITE_URL_PLACEHOLDER,
  normalizeSiteUrl,
  renderIndexHtml,
  renderRobots,
  renderSitemap,
} from "./seo-files";

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

describe("normalizeSiteUrl", () => {
  it("strips a trailing slash", () => {
    expect(normalizeSiteUrl("https://jcioriente.org/")).toBe("https://jcioriente.org");
  });

  it.each(["http://jcioriente.org", "https://jcioriente.org/es", "https://jcioriente.org/?a=1"])(
    "rejects %s",
    (bad) => {
      expect(() => normalizeSiteUrl(bad)).toThrow(/bare https origin/);
    },
  );
});

describe("index.html", () => {
  it("carries no hardcoded public origin", () => {
    expect(indexHtml).not.toMatch(/https:\/\/[^"]*jcioriente/);
    expect(indexHtml).toContain(`${SITE_URL_PLACEHOLDER}/`);
  });

  it("stamps every placeholder with the site origin", () => {
    const html = renderIndexHtml(indexHtml, ORIGIN);
    expect(html).not.toContain(SITE_URL_PLACEHOLDER);
    expect(html).toContain('<link rel="canonical" href="https://example.org/" />');
    expect(html).toContain('content="https://example.org/og-image-v2.png"');
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
