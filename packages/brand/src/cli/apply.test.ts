import { cpSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BrandConfigError, REPO_ROOT, loadProfile } from "../load-profile.ts";
import { applyProfile, renderFirebaserc } from "./apply.ts";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "brand-apply-"));
  cpSync(join(REPO_ROOT, "brand"), join(root, "brand"), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("renderFirebaserc", () => {
  it("renders the jci-oriente profile as today's .firebaserc with the targets renamed", () => {
    const { brand } = loadProfile({ repoRoot: REPO_ROOT, profile: "jci-oriente" });
    expect(renderFirebaserc(brand)).toEqual({
      projects: { default: "jci-oriente" },
      targets: {
        "jci-oriente": {
          storage: { default: ["jci-oriente.firebasestorage.app"] },
          hosting: {
            spotlight: ["jcioriente"],
            backstage: ["jcioriente-backstage"],
          },
        },
      },
      etags: {},
    });
  });
});

describe("applyProfile", () => {
  it("writes .firebaserc for the selected profile", () => {
    const result = applyProfile({ repoRoot: root, env: { BRAND_PROFILE: "fixture" } });
    expect(result).toMatchObject({ slug: "fixture", projectId: "demo-fixture", written: true });
    const written = JSON.parse(readFileSync(join(root, ".firebaserc"), "utf8"));
    expect(written.projects.default).toBe("demo-fixture");
  });

  it("leaves an up-to-date file untouched", () => {
    applyProfile({ repoRoot: root, env: { BRAND_PROFILE: "fixture" } });
    const file = join(root, ".firebaserc");
    const before = statSync(file).mtimeMs;
    expect(applyProfile({ repoRoot: root, env: { BRAND_PROFILE: "fixture" } }).written).toBe(false);
    expect(statSync(file).mtimeMs).toBe(before);
  });

  it("replaces a stale file from another profile", () => {
    writeFileSync(join(root, ".firebaserc"), '{"projects":{"default":"someone-else"}}');
    applyProfile({ repoRoot: root, env: { BRAND_PROFILE: "jci-oriente" } });
    expect(readFileSync(join(root, ".firebaserc"), "utf8")).toContain('"default": "jci-oriente"');
  });

  it("refuses an unknown profile without writing", () => {
    expect(() => applyProfile({ repoRoot: root, env: { BRAND_PROFILE: "nope" } })).toThrow(
      BrandConfigError,
    );
    expect(() => statSync(join(root, ".firebaserc"))).toThrow();
  });
});
