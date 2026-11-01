import { siteConfigDocSchema } from "@luminova/types";
import { describe, expect, it } from "vitest";
import { EXAMPLE_PROFILE, loadProfile } from "./load-profile.ts";
import { SEEDED_SITE_CONTENT_KEYS, pickSeededSiteContent } from "./site-content.ts";

const { siteContent } = loadProfile({ profile: EXAMPLE_PROFILE });

describe("the example's site texts", () => {
  // The brand package keeps its own copy of the shape (the loader runs before
  // @luminova/types is built); the Firestore schema must read it unchanged.
  it("parse with the siteConfig schema the app and the seeds use, unchanged", () => {
    const doc = siteConfigDocSchema
      .omit({ version: true, updatedAt: true })
      .strict()
      .parse(siteContent);
    expect(doc).toStrictEqual(siteContent);
  });
});

describe("pickSeededSiteContent", () => {
  it("keeps only the keys the seeds own, so hero and linktree edits survive a re-seed", () => {
    expect(Object.keys(pickSeededSiteContent(siteContent)).sort()).toEqual(
      [...SEEDED_SITE_CONTENT_KEYS].sort(),
    );
  });
});
