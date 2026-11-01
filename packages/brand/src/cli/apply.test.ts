import { readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BrandConfigError, EXAMPLE_PROFILE, loadProfile } from "../load-profile.ts";
import { localProfile, localRepo } from "../test-profiles.ts";
import { applyProfile, renderFirebaserc } from "./apply.ts";

/** `profile` names one; without it, brand/ selects (the test chapter here). */
function apply(profile: string | undefined, env: Record<string, string> = {}) {
  return applyProfile({
    profile: loadProfile({ repoRoot: root, env, profile }),
    repoRoot: root,
    env,
  });
}

let root: string;

beforeEach(() => {
  root = localRepo("brand-apply-");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("renderFirebaserc", () => {
  it("renders a chapter profile as .firebaserc with the hosting targets named by app", () => {
    const { brand } = localProfile();
    expect(renderFirebaserc(brand)).toEqual({
      projects: { default: "jci-valle" },
      targets: {
        "jci-valle": {
          storage: { default: ["jci-valle.firebasestorage.app"] },
          hosting: {
            spotlight: ["jcivalle"],
            backstage: ["jcivalle-backstage"],
          },
        },
      },
      etags: {},
    });
  });
});

describe("applyProfile", () => {
  it("writes .firebaserc for the selected profile", () => {
    const result = apply(EXAMPLE_PROFILE);
    expect(result).toMatchObject({ slug: "example", projectId: "demo-example", written: true });
    const written = JSON.parse(readFileSync(join(root, ".firebaserc"), "utf8"));
    expect(written.projects.default).toBe("demo-example");
  });

  it("leaves an up-to-date file untouched", () => {
    apply(EXAMPLE_PROFILE);
    const file = join(root, ".firebaserc");
    const before = statSync(file).mtimeMs;
    expect(apply(EXAMPLE_PROFILE).written).toBe(false);
    expect(statSync(file).mtimeMs).toBe(before);
  });

  it("replaces a stale file from another profile", () => {
    writeFileSync(join(root, ".firebaserc"), '{"projects":{"default":"someone-else"}}');
    apply("local");
    expect(readFileSync(join(root, ".firebaserc"), "utf8")).toContain('"default": "jci-valle"');
  });

  it("in release mode refuses a profile that cannot ship, without writing", () => {
    const release = { BRAND_RELEASE: "1" };
    expect(() => apply(undefined, { ...release, BRAND_PROFILE: EXAMPLE_PROFILE })).toThrow(
      /set in your environment/,
    );
    expect(() => apply(EXAMPLE_PROFILE, release)).toThrow(
      /is the example and can never be released/,
    );
    expect(() => statSync(join(root, ".firebaserc"))).toThrow();
    expect(apply(undefined, release).written).toBe(true);
  });

  it("refuses an unknown profile without writing", () => {
    expect(() => apply("nope")).toThrow(BrandConfigError);
    expect(() => statSync(join(root, ".firebaserc"))).toThrow();
  });
});
