import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const indexHtml = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
const serviceWorker = readFileSync(
  resolve(process.cwd(), "public/firebase-messaging-sw.js"),
  "utf8",
);

describe("index.html", () => {
  it("takes every chapter value from the brand profile", () => {
    expect(indexHtml).not.toMatch(/JCI Oriente|#130F2D/);
    expect(indexHtml).toContain('<html lang="__LANG__">');
    expect(indexHtml).toContain('content="__THEME_COLOR__"');
    expect(indexHtml).toContain("<title>__BRAND_TITLE__</title>");
  });
});

describe("firebase-messaging-sw.js", () => {
  it("falls back to the brand name staged in by the plugin", () => {
    expect(serviceWorker).not.toContain("JCI Oriente");
    expect(serviceWorker).toContain('"__BRAND_NAME__"');
  });
});
