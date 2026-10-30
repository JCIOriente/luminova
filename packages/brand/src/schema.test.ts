import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { brandFileSchema, renderBrandJsonSchema, type Table } from "./schema.ts";
import { exampleToml } from "./test-profiles.ts";

describe("brand.schema.json", () => {
  it("is regenerated from the zod schema (pnpm brand:schema)", () => {
    const committed = readFileSync(
      new URL("../../../brand/brand.schema.json", import.meta.url),
      "utf8",
    );
    expect(committed).toBe(renderBrandJsonSchema());
  });

  it("requires only the identity, since a chapter's file leaves the rest to the example", () => {
    const schema = JSON.parse(renderBrandJsonSchema());
    expect(schema.required).toEqual(["name", "city", "country", "project", "colors"]);
    expect(schema.properties.colors.required).toEqual(["spotlight"]);
    expect(schema.properties.seo.required).toBeUndefined();
    expect(schema.properties.contact.required).toBeUndefined();
    // A chapter's array replaces the example's whole, so each entry is complete.
    expect(schema.properties.timeline.items.required).toEqual(["year", "title", "description"]);
    expect(schema.additionalProperties).toBe(false);
  });
});

/** The example's own brand.toml: a complete file. */
const valid = exampleToml;

function rejects(mutate: (file: Table) => void, path: string) {
  const file = valid();
  mutate(file);
  const result = brandFileSchema.safeParse(file);
  expect(result.success).toBe(false);
  expect(result.error?.issues.map((issue) => issue.path.join("."))).toContain(path);
}

describe("brandFileSchema", () => {
  it("rejects an empty object", () => {
    expect(brandFileSchema.safeParse({}).success).toBe(false);
  });

  it("accepts the example", () => {
    expect(brandFileSchema.parse(valid())).toMatchObject({ project: "demo-example" });
  });

  it.each([
    ["non-https", "http://fixture.example.org"],
    ["pathful", "https://fixture.example.org/es"],
    ["not a URL", "fixture"],
  ])("rejects a %s production URL", (_, url) => {
    rejects((f) => (f.urls = { spotlight: url }), "urls.spotlight");
  });

  it("rejects a non-https parent organization URL", () => {
    rejects(
      (f) => (f.parentOrganization = { name: "x", url: "http://national.example.org/" }),
      "parentOrganization.url",
    );
  });

  it.each(["0097D7", "#0097D", "#GGGGGG", "blue"])("rejects the color %s", (color) => {
    rejects((f) => (f.colors = { spotlight: "#336699", backstage: color }), "colors.backstage");
  });

  it.each(["jcioriente:member", "Fixture", "", "a b"])("rejects the qrPrefix %j", (prefix) => {
    rejects((f) => (f.qrPrefix = prefix), "qrPrefix");
  });

  it.each([1800, 2101, 1993.5])("rejects foundedYear %d", (year) => {
    rejects((f) => (f.foundedYear = year), "foundedYear");
  });

  it("rejects an unknown key, so a typo cannot pass silently", () => {
    rejects((f) => Object.assign(f, { nmae: "typo" }), "");
  });

  it.each(["../og.png", "og image.png", "og.jpg"])("rejects the legacy OG path %s", (path) => {
    rejects((f) => (f.og = { legacyPaths: [path] }), "og.legacyPaths.0");
  });

  it("rejects a reserved legacy OG path that would shadow the hashed image", () => {
    rejects((f) => (f.og = { legacyPaths: ["og-image.png"] }), "og.legacyPaths.0");
  });

  it.each(["Fixture_Project", "demo"])("rejects the project id %s", (project) => {
    rejects((f) => (f.project = project), "project");
  });

  it("rejects a malformed web app id", () => {
    rejects((f) => (f.firebase = { spotlight: { appId: "web-app" } }), "firebase.spotlight.appId");
  });

  it("rejects a contact email that is no address, and accepts a blank one", () => {
    rejects(
      (f) => (f.backstage = Object.assign({}, f.backstage, { contactEmail: "not-an-email" })),
      "backstage.contactEmail",
    );
    const blank = valid();
    blank.backstage = Object.assign({}, blank.backstage, { contactEmail: "" });
    expect(brandFileSchema.safeParse(blank).success).toBe(true);
  });

  it("rejects an empty name", () => {
    rejects((f) => (f.name = ""), "name");
  });
});
