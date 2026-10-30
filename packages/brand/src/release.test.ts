import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXAMPLE_PROFILE, REPO_ROOT, loadProfile, type LoadedProfile } from "./load-profile.ts";
import {
  PULLED_ASSETS_DIR,
  RELEASE_MARKER_FILE,
  isRelease,
  readReleaseMarker,
  releaseErrors,
  releaseIdentity,
} from "./release.ts";
import { chapterProfile } from "./test-profiles.ts";

const BUILD = { command: "build", emulatorEnabled: false } as const;

let root: string;
let assetsDir: string;

const chapter = chapterProfile();
const overridden: LoadedProfile = { ...chapter, source: "override" };
const example = () => loadProfile({ repoRoot: REPO_ROOT, profile: EXAMPLE_PROFILE });

function writeManifest(profile = "jci-valle") {
  mkdirSync(assetsDir, { recursive: true });
  const body = JSON.stringify({ profile, objects: [] });
  writeFileSync(join(assetsDir, "pull-manifest.json"), body);
  return createHash("sha256").update(body).digest("hex");
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "brand-release-"));
  assetsDir = join(root, PULLED_ASSETS_DIR);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("isRelease", () => {
  it("is on only for BRAND_RELEASE=1", () => {
    expect(isRelease({ BRAND_RELEASE: "1" })).toBe(true);
    expect(isRelease({})).toBe(false);
    expect(isRelease({ BRAND_RELEASE: "0" })).toBe(false);
  });

  it("refuses an ambiguous value instead of silently building a non-release dist", () => {
    expect(() => isRelease({ BRAND_RELEASE: "true" })).toThrow(
      /BRAND_RELEASE must be "1"[\s\S]*unset BRAND_RELEASE/,
    );
  });
});

const messages = (problems: readonly { message: string }[]) =>
  problems.map(({ message }) => message);

describe("release remedies", () => {
  it("asks to drop a BRAND_PROFILE override, so the profile in brand/ ships", () => {
    const [problem] = releaseErrors({ profile: overridden, env: {}, assetsDir, ...BUILD });
    expect(problem?.message).toMatch(/what ships is the profile found in brand\/\./);
    expect(problem?.remedies).toEqual([
      expect.objectContaining({ run: "unset BRAND_PROFILE", where: "shell" }),
    ]);
  });

  it("points a missing pull manifest at brand:pull", () => {
    const problems = releaseErrors({ profile: chapter, env: {}, assetsDir, ...BUILD });
    expect(problems.flatMap(({ remedies }) => remedies ?? []).map(({ run }) => run)).toContain(
      "pnpm brand:pull",
    );
  });
});

describe("releaseErrors", () => {
  it("passes a chapter's deploy: explicit profile, matching project, pulled assets", () => {
    writeManifest();
    expect(
      messages(
        releaseErrors({
          profile: chapter,
          env: { GCP_PROJECT_ID: "jci-valle" },
          assetsDir,
          ...BUILD,
        }),
      ),
    ).toEqual([]);
  });

  it("refuses a profile chosen by an environment override", () => {
    writeManifest();
    expect(messages(releaseErrors({ profile: overridden, env: {}, assetsDir, ...BUILD }))).toEqual([
      expect.stringMatching(/BRAND_PROFILE=jci-valle is set in your environment/),
    ]);
  });

  it("rejects the example, sending the user to their chapter's own profile", () => {
    writeManifest(EXAMPLE_PROFILE);
    const problems = releaseErrors({ profile: example(), env: {}, assetsDir, ...BUILD });
    expect(messages(problems)).toEqual([
      expect.stringMatching(/"example" is the example and can never be released/),
    ]);
    expect(problems[0]?.remedies?.[0]?.change).toMatch(/pnpm brand:init/);
  });

  it("rejects a local-only chapter, naming its demo- project", () => {
    writeManifest();
    const local = { ...chapter, localOnly: true };
    expect(messages(releaseErrors({ profile: local, env: {}, assetsDir, ...BUILD }))).toEqual([
      expect.stringMatching(
        /"jci-valle" is local-only \(project "jci-valle" exists only in the emulators\)/,
      ),
    ]);
  });

  it("rejects BRAND_ASSETS_DIR", () => {
    writeManifest();
    expect(
      messages(
        releaseErrors({
          profile: chapter,
          env: { BRAND_ASSETS_DIR: "elsewhere" },
          assetsDir,
          ...BUILD,
        }),
      ),
    ).toEqual([expect.stringMatching(/^BRAND_ASSETS_DIR is not allowed in release mode/)]);
  });

  it("rejects a GCP_PROJECT_ID that is not the profile's project", () => {
    writeManifest();
    expect(
      messages(
        releaseErrors({
          profile: chapter,
          env: { GCP_PROJECT_ID: "someone-else" },
          assetsDir,
          ...BUILD,
        }),
      ),
    ).toEqual([expect.stringMatching(/^GCP_PROJECT_ID "someone-else" is not profile "jci-valle"/)]);
  });

  it("requires the pull manifest, so release assets come only from brand:pull", () => {
    expect(messages(releaseErrors({ profile: chapter, env: {}, assetsDir, ...BUILD }))).toEqual([
      expect.stringMatching(
        /^no pull-manifest\.json in brand-assets\/: a deploy only uses images downloaded with brand:pull/,
      ),
    ]);
  });

  it("lists every problem at once", () => {
    const errors = messages(
      releaseErrors({
        profile: { ...example(), source: "override" },
        env: { BRAND_ASSETS_DIR: "x", GCP_PROJECT_ID: "someone-else" },
        assetsDir,
        ...BUILD,
      }),
    );
    expect(errors).toHaveLength(5);
  });
});

describe("releaseErrors on the build itself", () => {
  it("refuses the dev server and an emulator build", () => {
    writeManifest();
    const env = { GCP_PROJECT_ID: "jci-valle" };
    const needsBuild = /release mode needs a production `vite build`/;
    expect(
      messages(
        releaseErrors({
          profile: chapter,
          env,
          assetsDir,
          command: "serve",
          emulatorEnabled: false,
        }),
      ),
    ).toEqual([expect.stringMatching(needsBuild)]);
    expect(
      messages(
        releaseErrors({
          profile: chapter,
          env,
          assetsDir,
          command: "build",
          emulatorEnabled: true,
        }),
      ),
    ).toEqual([expect.stringMatching(needsBuild)]);
  });
});

describe("release marker", () => {
  it("records the profile, its project and the pull manifest's sha256", () => {
    const digest = writeManifest();
    expect(releaseIdentity(chapter, assetsDir)).toEqual({
      profile: "jci-valle",
      projectId: "jci-valle",
      assets: digest,
    });
  });

  it("reads back a written marker and returns null when there is none", () => {
    const dist = join(root, "dist");
    mkdirSync(dist);
    expect(readReleaseMarker(dist)).toBeNull();
    const marker = {
      profile: "jci-valle",
      projectId: "jci-valle",
      assets: "a".repeat(64),
      indexHtml: "b".repeat(64),
    };
    writeFileSync(join(dist, RELEASE_MARKER_FILE), JSON.stringify(marker));
    expect(readReleaseMarker(dist)).toEqual(marker);
  });

  it("rejects a malformed marker", () => {
    const dist = join(root, "dist");
    mkdirSync(dist);
    writeFileSync(join(dist, RELEASE_MARKER_FILE), JSON.stringify({ profile: "x" }));
    expect(() => readReleaseMarker(dist)).toThrow(/\.brand-release\.json projectId/);
  });
});
