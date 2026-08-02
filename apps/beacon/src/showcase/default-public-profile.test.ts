import { describe, expect, it } from "vitest";
import { needsPublicProfileDefault, PUBLIC_PROFILE_DEFAULT } from "./default-public-profile.js";

describe("needsPublicProfileDefault", () => {
  it("stamps a doc created without the key", () => {
    expect(needsPublicProfileDefault({ name: "Ana" })).toBe(true);
  });

  it("never overwrites a decision already on the doc", () => {
    expect(needsPublicProfileDefault({ name: "Ana", publicProfile: false })).toBe(false);
    expect(needsPublicProfileDefault({ name: "Ana", publicProfile: true })).toBe(false);
    // An explicit null is still a present key — re-stamping would fight the writer, and
    // the write itself would re-fire this trigger.
    expect(needsPublicProfileDefault({ name: "Ana", publicProfile: null })).toBe(false);
  });

  it("does nothing without a document", () => {
    expect(needsPublicProfileDefault(undefined)).toBe(false);
  });

  it("defaults members to publishable (opt-out)", () => {
    expect(PUBLIC_PROFILE_DEFAULT).toBe(true);
  });
});
