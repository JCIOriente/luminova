import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { brandSchema, renderBrandJsonSchema } from "./schema.ts";

describe("brand.schema.json", () => {
  it("is regenerated from the zod schema (pnpm brand:schema)", () => {
    const committed = readFileSync(
      new URL("../../../brand/brand.schema.json", import.meta.url),
      "utf8",
    );
    expect(committed).toBe(renderBrandJsonSchema());
  });
});

function validBrand() {
  return {
    $schema: "../brand.schema.json",
    slug: "fixture",
    name: "Fixture Chapter",
    shortName: "Fixture",
    legalName: "Fixture Chapter Association",
    movementName: "Fixture Movement",
    description: "Fixture Chapter description",
    locality: {
      city: "Springfield",
      cityFormal: "Springfield City",
      region: "the Springfield valley",
      regionShort: "the valley",
      country: "Fixtureland",
    },
    foundedYear: 2001,
    stats: { nationalOrganizations: 7 },
    parentOrganization: { name: "Fixture National", url: "https://national.example.org/" },
    broadcastChannelName: "Fixture Broadcast",
    locale: "es",
    ogLocale: "es_BO",
    urls: {
      spotlight: "https://fixture.example.org",
      backstage: "https://admin.fixture.example.org",
    },
    qrPrefix: "fixture",
    themeColor: { spotlight: "#336699", backstage: "#222222" },
    seo: {
      title: "Fixture title",
      description: "Fixture description",
      ogTitle: "Fixture OG title",
      ogDescription: "Fixture OG description",
      ogImageAlt: "Fixture OG alt",
      twitterDescription: "Fixture Twitter description",
    },
    backstage: {
      title: "Fixture portal",
      emailPlaceholder: "you@fixture.example.org",
      contactEmail: "hello@fixture.example.org",
    },
    og: { legacyPaths: ["og-old.png"] },
    firebase: {
      projectId: "demo-fixture",
      storageBucket: "demo-fixture.firebasestorage.app",
      sites: { spotlight: "demo-fixture", backstage: "demo-fixture-backstage" },
      web: {
        authDomain: "demo-fixture.firebaseapp.com",
        messagingSenderId: "100000000001",
        spotlight: {
          apiKey: "fixture-spotlight-api-key",
          appId: "1:100000000001:web:fixture01",
          appCheckSiteKey: "",
          vapidKey: "",
        },
        backstage: {
          apiKey: "fixture-backstage-api-key",
          appId: "1:100000000001:web:fixture02",
          appCheckSiteKey: "",
          vapidKey: "",
        },
      },
    },
    assetsBucket: "demo-fixture-brand-assets",
  };
}

type Brand = ReturnType<typeof validBrand>;

function rejects(mutate: (brand: Brand) => void, path: string) {
  const brand = validBrand();
  mutate(brand);
  const result = brandSchema.safeParse(brand);
  expect(result.success).toBe(false);
  expect(result.error?.issues.map((issue) => issue.path.join("."))).toContain(path);
}

describe("brandSchema", () => {
  it("rejects an empty object", () => {
    expect(brandSchema.safeParse({}).success).toBe(false);
  });

  it("accepts a full profile", () => {
    expect(brandSchema.parse(validBrand())).toMatchObject({ slug: "fixture" });
  });

  it("defaults og.legacyPaths to none", () => {
    const brand: Partial<Brand> = validBrand();
    delete brand.og;
    expect(brandSchema.parse(brand).og.legacyPaths).toEqual([]);
  });

  it.each([
    ["non-https", "http://fixture.example.org"],
    ["pathful", "https://fixture.example.org/es"],
    ["not a URL", "fixture"],
  ])("rejects a %s production URL", (_, url) => {
    rejects((b) => (b.urls.spotlight = url), "urls.spotlight");
  });

  it("rejects a non-https parent organization URL", () => {
    rejects(
      (b) => (b.parentOrganization.url = "http://national.example.org/"),
      "parentOrganization.url",
    );
  });

  it.each(["0097D7", "#0097D", "#GGGGGG", "blue"])("rejects the theme color %s", (color) => {
    rejects((b) => (b.themeColor.backstage = color), "themeColor.backstage");
  });

  it.each(["jcioriente:member", "Fixture", "", "a b"])("rejects the qrPrefix %j", (prefix) => {
    rejects((b) => (b.qrPrefix = prefix), "qrPrefix");
  });

  it.each([1800, 2101, 1993.5])("rejects foundedYear %d", (year) => {
    rejects((b) => (b.foundedYear = year), "foundedYear");
  });

  it.each(["apiKey", "appId", "appCheckSiteKey", "vapidKey"] as const)(
    "rejects a missing firebase.web.spotlight.%s",
    (key) => {
      rejects(
        (b) =>
          delete (b.firebase.web.spotlight as Partial<Brand["firebase"]["web"]["spotlight"]>)[key],
        `firebase.web.spotlight.${key}`,
      );
    },
  );

  it("rejects an unknown key, so a typo cannot pass silently", () => {
    rejects((b) => Object.assign(b, { nmae: "typo" }), "");
  });

  it.each(["Fixture", "fixture_", "-fixture"])("rejects the slug %s", (slug) => {
    rejects((b) => (b.slug = slug), "slug");
  });

  it.each(["../og.png", "og image.png", "og.jpg"])("rejects the legacy OG path %s", (path) => {
    rejects((b) => (b.og.legacyPaths = [path]), "og.legacyPaths.0");
  });

  it("rejects a reserved legacy OG path that would shadow the hashed image", () => {
    rejects((b) => (b.og.legacyPaths = ["og-image.png"]), "og.legacyPaths.0");
  });

  it("rejects a malformed project id", () => {
    rejects((b) => (b.firebase.projectId = "Fixture_Project"), "firebase.projectId");
  });

  it("rejects a missing locality.regionShort", () => {
    rejects(
      (b) => delete (b.locality as Partial<Brand["locality"]>).regionShort,
      "locality.regionShort",
    );
  });

  it.each(["", "not-an-email"])("rejects the backstage.contactEmail %j", (email) => {
    rejects((b) => (b.backstage.contactEmail = email), "backstage.contactEmail");
  });

  it("rejects an empty name", () => {
    rejects((b) => (b.name = ""), "name");
  });
});
