import { describe, expect, it } from "vitest";
import { renderHtml } from "./render-html.ts";

describe("renderHtml", () => {
  it("replaces every occurrence of each placeholder", () => {
    const html = '<html lang="__LANG__"><title>__BRAND_TITLE__</title><b>__LANG__</b></html>';
    expect(renderHtml(html, { LANG: "es", BRAND_TITLE: "Fixture" })).toBe(
      '<html lang="es"><title>Fixture</title><b>es</b></html>',
    );
  });

  it("escapes &, quotes and angle brackets but leaves other characters untouched", () => {
    expect(renderHtml('<meta content="__X__">', { X: `A & "B" <c> — ó 'd'` })).toBe(
      `<meta content="A &amp; &quot;B&quot; &lt;c&gt; — ó 'd'">`,
    );
  });

  it("fails naming every leftover token", () => {
    expect(() => renderHtml("__LANG__ __OG_IMAGE__ __SITE_URL__", { LANG: "es" })).toThrow(
      /__OG_IMAGE__.*__SITE_URL__/,
    );
  });

  it("ignores double-underscore text that is not a token", () => {
    expect(renderHtml("__proto__ a__b", {})).toBe("__proto__ a__b");
  });
});
