import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  baseLayer,
  layer,
  inheritedExampleValues,
  parseBrandToml,
  readBrandToml,
  resolveBrandFile,
  tomlLocation,
} from "./brand-file.ts";
import { EXAMPLE_PROFILE, REPO_ROOT, loadProfile } from "./load-profile.ts";
import type { Table } from "./schema.ts";
import { errorsOf, exampleToml } from "./test-profiles.ts";

const LABEL = "brand/acme/brand.toml";
const BASE_LABEL = "brand/example/brand.toml";

const IDENTITY = `
name = "JCI Andina"
city = "Cochabamba"
country = "Bolivia"
project = "demo-andina"

[colors]
spotlight = "#0097D7"
`;

function resolve(toml: string) {
  return resolveBrandFile({
    slug: "acme",
    chapter: parseBrandToml(toml, LABEL),
    base: exampleToml(),
    label: LABEL,
    baseLabel: BASE_LABEL,
  });
}

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8"));

/** A committed brand.json fixture without its editor hint, which brand.toml has no key for. */
const oldBrand = (name: string): Table =>
  Object.fromEntries(Object.entries(fixture(name) as Table).filter(([key]) => key !== "$schema"));

describe("JCI Oriente's brand.toml", () => {
  // The JSON files it replaced, as committed before the move to TOML: the deploy must not change.
  it("resolves to the brand.json it replaced, field for field", () => {
    expect(loadProfile({ profile: "jci-oriente" }).brand).toStrictEqual(
      oldBrand("jci-oriente.brand.json"),
    );
  });

  it("resolves to the site-content.json it replaced, field for field", () => {
    expect(loadProfile({ profile: "jci-oriente" }).siteContent).toStrictEqual(
      fixture("jci-oriente.site-content.json"),
    );
  });

  it("pins the QR prefix its printed credentials carry", () => {
    expect(
      readBrandToml(join(REPO_ROOT, "brand", "jci-oriente", "brand.toml"), "oriente").qrPrefix,
    ).toBe("jcioriente");
  });

  it("keeps the key order the bundles inline", () => {
    const { brand, siteContent } = loadProfile({ profile: "jci-oriente" });
    expect(Object.keys(brand.locality)).toEqual([
      "city",
      "cityFormal",
      "region",
      "country",
      "regionShort",
    ]);
    expect(JSON.stringify(siteContent)).toBe(
      JSON.stringify(fixture("jci-oriente.site-content.json")),
    );
  });
});

describe("the example's brand.toml", () => {
  it("resolves to the JSON it replaced, except the sentences its templates rewrote", () => {
    const old = oldBrand("example.brand.json");
    const { brand, siteContent } = loadProfile({ profile: EXAMPLE_PROFILE });
    expect(brand).toStrictEqual({
      ...old,
      legalName: "Cámara Junior Internacional Ciudad Ejemplo",
      description: "Junior Chamber International Ciudad Ejemplo",
      locality: {
        city: "Ciudad Ejemplo",
        cityFormal: "Ciudad Ejemplo",
        region: "Ciudad Ejemplo",
        country: "Bolivia",
        regionShort: "Ciudad Ejemplo",
      },
      seo: {
        ...(old.seo as Table),
        description:
          "JCI Ejemplo, capítulo Ciudad Ejemplo de la Cámara Junior Internacional. Formamos líderes con propósito.",
        ogDescription:
          "Formamos líderes con propósito en Ciudad Ejemplo. Conoce nuestros proyectos, nuestro impacto y cómo unirte.",
        twitterDescription: "Formamos líderes con propósito en Ciudad Ejemplo.",
      },
      og: { legacyPaths: [] },
    });
    const oldContent = fixture("example.site-content.json") as Table & { timeline: unknown[] };
    expect(siteContent).toStrictEqual({
      ...oldContent,
      timeline: [oldContent.timeline[0], oldContent.timeline[2]],
      mvv: {
        ...(oldContent.mvv as Table),
        mision:
          "Brindar oportunidades de desarrollo que empoderen a las personas jóvenes para crear cambios positivos en Ciudad Ejemplo.",
      },
    });
  });
});

describe("layering", () => {
  it("merges tables key by key and replaces arrays whole", () => {
    expect(
      layer(
        { a: { b: 1, c: 2 }, list: [1, 2, 3], keep: "x" },
        { a: { c: 9 }, list: [7], add: true },
      ),
    ).toEqual({ a: { b: 1, c: 9 }, list: [7], keep: "x", add: true });
  });

  it("never passes the example's identity to a chapter", () => {
    const base = baseLayer(exampleToml());
    for (const key of ["name", "city", "country", "project"]) expect(base).not.toHaveProperty(key);
    expect(base.colors).toEqual({ backstage: "#222222" });
    expect(base).not.toHaveProperty("firebase");
  });

  it("gives a chapter that writes only its identity every default", () => {
    const { brand, siteContent } = resolve(IDENTITY);
    expect(brand).toMatchObject({
      slug: "acme",
      name: "JCI Andina",
      shortName: "JCI Andina",
      legalName: "Cámara Junior Internacional Cochabamba",
      locality: { city: "Cochabamba", cityFormal: "Cochabamba", region: "Cochabamba" },
      themeColor: { spotlight: "#0097D7", backstage: "#222222" },
      seo: { title: "JCI Andina: Cámara Junior Internacional en Cochabamba" },
      backstage: { title: "JCI Andina — Portal de miembros" },
    });
    expect(siteContent.reasons).toHaveLength(3);
    expect(siteContent.contact.location).toBe("Cochabamba, Bolivia");
  });

  it("replaces an array the chapter writes, and keeps the example's otherwise", () => {
    const { siteContent } = resolve(
      `${IDENTITY}\n[[timeline]]\nyear = "1990"\ntitle = "Fundación"\ndescription = "Nace {name}."\n`,
    );
    expect(siteContent.timeline).toEqual([
      { year: "1990", title: "Fundación", description: "Nace JCI Andina." },
    ]);
    expect(siteContent.contact.links).toHaveLength(2);
  });
});

describe("templates", () => {
  it("expand after the merge, so an overridden identity value reaches every default text", () => {
    const { brand } = resolve(`${IDENTITY}\n[locality]\nregion = "el valle"\n`);
    expect(brand.locality.regionShort).toBe("el valle");
    expect(brand.seo.twitterDescription).toBe("Formamos líderes con propósito en el valle.");
  });

  it("let a chapter keep its own sentence", () => {
    const { brand } = resolve(`${IDENTITY}\n[seo]\ntitle = "Hola"\n`);
    expect(brand.seo.title).toBe("Hola");
    expect(brand.seo.ogTitle).toBe("JCI Andina: Cámara Junior Internacional en Cochabamba");
  });

  it("refuse an unknown placeholder, naming the file, table and key", () => {
    expect(errorsOf(() => resolve(`${IDENTITY}\n[hero]\nmotto = "Hola {ciudad}"\n`))).toEqual([
      expect.stringMatching(
        /^brand\/acme\/brand\.toml \[hero\] motto: unknown placeholder \{ciudad\}/,
      ),
    ]);
  });

  it("refuse a placeholder that refers back to itself", () => {
    expect(errorsOf(() => resolve(`shortName = "{shortName}"\n${IDENTITY}`))).toEqual([
      expect.stringMatching(/shortName: \{shortName\} refers back to itself$/),
    ]);
  });
});

describe("derived from project", () => {
  it("fills the Firebase values, sites, urls, qrPrefix and bucket", () => {
    const { brand } = resolve(
      IDENTITY.replace("demo-andina", "jci-andina") +
        `\n[firebase.spotlight]\napiKey = "k1"\nappId = "1:123456789012:web:aa01"\n` +
        `\n[firebase.backstage]\napiKey = "k2"\nappId = "1:123456789012:web:aa02"\n`,
    );
    expect(brand.firebase).toEqual({
      projectId: "jci-andina",
      storageBucket: "jci-andina.firebasestorage.app",
      sites: { spotlight: "jci-andina", backstage: "jci-andina-backstage" },
      web: {
        authDomain: "jci-andina.firebaseapp.com",
        messagingSenderId: "123456789012",
        spotlight: {
          apiKey: "k1",
          appId: "1:123456789012:web:aa01",
          appCheckSiteKey: "",
          vapidKey: "",
        },
        backstage: {
          apiKey: "k2",
          appId: "1:123456789012:web:aa02",
          appCheckSiteKey: "",
          vapidKey: "",
        },
      },
    });
    expect(brand.urls).toEqual({
      spotlight: "https://jci-andina.web.app",
      backstage: "https://jci-andina-backstage.web.app",
    });
    expect(brand.qrPrefix).toBe("jciandina");
    expect(brand.assetsBucket).toBe("jci-andina-brand-assets");
  });

  it("lets every derived value be overridden", () => {
    const { brand } = resolve(
      `qrPrefix = "andina"\nassetsBucket = "my-bucket"\n${IDENTITY}\n[firebase.sites]\nspotlight = "andina"\n`,
    );
    expect(brand.qrPrefix).toBe("andina");
    expect(brand.assetsBucket).toBe("my-bucket");
    expect(brand.urls.spotlight).toBe("https://andina.web.app");
    expect(brand.firebase.sites.backstage).toBe("demo-andina-backstage");
  });

  it("needs a real project's web keys, and none for a demo- project", () => {
    expect(resolve(IDENTITY).brand.firebase.web.spotlight).toEqual({
      apiKey: "demo-api-key",
      appId: "1:0:web:spotlight",
      appCheckSiteKey: "",
      vapidKey: "",
    });
    expect(errorsOf(() => resolve(IDENTITY.replace("demo-andina", "jci-andina")))).toEqual([
      expect.stringMatching(/^brand\/acme\/brand\.toml \[firebase\.spotlight\] apiKey: required/),
      expect.stringMatching(/\[firebase\.spotlight\] appId: required/),
      expect.stringMatching(/\[firebase\.backstage\] apiKey: required/),
      expect.stringMatching(/\[firebase\.backstage\] appId: required/),
    ]);
  });
});

describe("backstage contactEmail (D11)", () => {
  it("defaults to [contact] email", () => {
    const { brand } = resolve(`${IDENTITY}\n[contact]\nemail = "hola@andina.example.org"\n`);
    expect(brand.backstage.contactEmail).toBe("hola@andina.example.org");
  });

  it("is blank, so the login page hides the link, when neither is set", () => {
    expect(resolve(`${IDENTITY}\n[contact]\nemail = ""\n`).brand.backstage.contactEmail).toBe("");
  });

  it("keeps its own value over [contact] email", () => {
    const { brand } = resolve(`${IDENTITY}\n[backstage]\ncontactEmail = "admin@andina.org"\n`);
    expect(brand.backstage.contactEmail).toBe("admin@andina.org");
  });
});

describe("errors name the file, the table and the key", () => {
  it("for a bad value", () => {
    expect(errorsOf(() => resolve(`${IDENTITY}\n[contact]\nemail = "nope"\n`))).toEqual([
      "brand/acme/brand.toml [contact] email: not an email address",
    ]);
  });

  it("for a missing key in an array entry, counting from 1", () => {
    const toml = `${IDENTITY}\n[[timeline]]\nyear = "1"\ntitle = "a"\ndescription = "b"\n[[timeline]]\ntitle = "c"\ndescription = "d"\n`;
    expect(errorsOf(() => resolve(toml))).toEqual([
      "brand/acme/brand.toml [[timeline]] 2, year: required",
    ]);
  });

  it("for a missing identity key", () => {
    expect(errorsOf(() => resolve(IDENTITY.replace('city = "Cochabamba"\n', "")))).toEqual([
      "brand/acme/brand.toml city: required",
    ]);
  });

  it("for a blank identity key, once, not again for every text built from it", () => {
    expect(errorsOf(() => resolve(IDENTITY.replace('name = "JCI Andina"', 'name = " "')))).toEqual([
      "brand/acme/brand.toml name: must not be blank",
    ]);
  });

  it("for a value of the wrong type", () => {
    expect(errorsOf(() => resolve(`foundedYear = "1990"\n${IDENTITY}`))).toEqual([
      "brand/acme/brand.toml foundedYear: Invalid input: expected number, received string",
    ]);
  });

  it("for an unknown key, so a typo never falls back to a default", () => {
    expect(errorsOf(() => resolve(`${IDENTITY}\n[contact]\nemial = "a@b.org"\n`))).toEqual([
      "brand/acme/brand.toml [contact] emial: unknown key (a typo?)",
    ]);
    expect(errorsOf(() => resolve(`nmae = "x"\n${IDENTITY}`))).toEqual([
      "brand/acme/brand.toml nmae: unknown key (a typo?)",
    ]);
  });

  it("for a public address that is no bare origin written in full, a line break included", () => {
    const urlError = (url: string) =>
      errorsOf(() => resolve(`${IDENTITY}\n[urls]\nspotlight = "${url}"\n`));
    for (const url of [
      "https://acme.example.org\\nproject_id=evil",
      "https://acme.example.org\\r",
      " https://acme.example.org",
    ]) {
      expect(urlError(url)).toEqual([
        "brand/acme/brand.toml [urls] spotlight: must hold no spaces or line breaks",
      ]);
    }
    for (const url of ["https://acme.example.org/", "https://Acme.example.org"]) {
      expect(urlError(url)).toEqual([
        'brand/acme/brand.toml [urls] spotlight: write it as "https://acme.example.org" (no path or trailing slash, lowercase, no default port)',
      ]);
    }
    expect(urlError("http://acme.example.org")).toEqual([
      "brand/acme/brand.toml [urls] spotlight: must be a bare https origin written in full, e.g. https://example.org",
    ]);
  });

  it("for a syntax error, with the line and column", () => {
    expect(errorsOf(() => parseBrandToml('name = "JCI\ncity = 1\n', LABEL))).toEqual([
      expect.stringMatching(/^brand\/acme\/brand\.toml: line 1, column \d+: /),
    ]);
  });
});

describe("tomlLocation", () => {
  const data = { og: { legacyPaths: ["a.png"] }, timeline: [{ year: "x" }] };
  it.each([
    [["name"], "name"],
    [["contact", "email"], "[contact] email"],
    [["contact", "socials", "instagram"], "[contact.socials] instagram"],
    [["timeline", 2, "year"], "[[timeline]] 3, year"],
    [["timeline", 0], "[[timeline]] 1"],
    [["contact", "links", 0, "url"], "[[contact.links]] 1, url"],
    [["og", "legacyPaths", 0], "[og] legacyPaths, item 1"],
  ])("writes %j as %s", (path, expected) => {
    expect(tomlLocation(path, data)).toBe(expected);
  });
});

describe("inheritedExampleValues", () => {
  it("names the values a chapter still takes from the example that only fit the example", () => {
    expect(inheritedExampleValues(parseBrandToml(IDENTITY, LABEL))).toEqual([
      "foundedYear",
      "[contact] email",
      "[backstage] emailPlaceholder",
      "[contact] mapUrl",
    ]);
    const own = `foundedYear = 1990\n${IDENTITY}\n[contact]\nemail = ""\nmapUrl = "https://maps.example.org/andina"\n[backstage]\nemailPlaceholder = "tu@andina.org"\n`;
    expect(inheritedExampleValues(parseBrandToml(own, LABEL))).toEqual([]);
  });
});
