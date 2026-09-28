// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SITE_URL_PLACEHOLDER,
  normalizeSiteUrl,
  renderIndexHtml,
  renderRobots,
  renderSitemap,
} from "./seo-files";

const indexHtml = readFileSync(new URL("./index.html", import.meta.url), "utf8");

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
    const html = renderIndexHtml(indexHtml, "https://example.org");
    expect(html).not.toContain(SITE_URL_PLACEHOLDER);
    expect(html).toContain('<link rel="canonical" href="https://example.org/" />');
    expect(html).toContain('content="https://example.org/og-image-v2.png"');
  });
});

describe("sitemap.xml and robots.txt", () => {
  it("point every URL at the site origin", () => {
    const sitemap = renderSitemap("https://example.org");
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs.length).toBeGreaterThan(0);
    expect(locs.every((loc) => loc?.startsWith("https://example.org/"))).toBe(true);
    expect(locs).toContain("https://example.org/");
    expect(renderRobots("https://example.org")).toContain(
      "Sitemap: https://example.org/sitemap.xml",
    );
  });
});
