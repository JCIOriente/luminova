import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sha256 } from "./hash.ts";
import { EXAMPLE_PROFILE, REPO_ROOT, loadProfile, type LoadedProfile } from "./load-profile.ts";
import {
  RELEASE_MARKER_FILE,
  isRelease,
  readReleaseMarker,
  releaseErrors,
  releaseIdentity,
} from "./release.ts";
import { TEST_CHAPTER, localRepo, recordLocal, writeChapter } from "./test-profiles.ts";

const BUILD = { command: "build", emulatorEnabled: false } as const;

let root: string;
let chapter: LoadedProfile;
let overridden: LoadedProfile;
const example = () => loadProfile({ repoRoot: REPO_ROOT, profile: EXAMPLE_PROFILE });
const local = (path = "") => join(root, "brand", "local", path);

/** brand/local/ as brand:pull leaves it: the files, recorded with source bucket. */
function writeManifest(project = "jci-valle") {
  recordLocal(root, { project });
  return sha256(readFileSync(local(".pull-manifest.json")));
}

beforeEach(() => {
  root = localRepo("brand-release-");
  chapter = loadProfile({ repoRoot: root, env: {} });
  overridden = { ...chapter, source: "override" };
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
    const [problem] = releaseErrors({ profile: overridden, env: {}, repoRoot: root, ...BUILD });
    expect(problem?.message).toMatch(/what ships is the profile found in brand\/\./);
    expect(problem?.remedies).toEqual([
      expect.objectContaining({ run: "unset BRAND_PROFILE", where: "shell" }),
    ]);
  });

  it("points a missing pull manifest at brand:pull", () => {
    const problems = releaseErrors({ profile: chapter, env: {}, repoRoot: root, ...BUILD });
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
          repoRoot: root,
          ...BUILD,
        }),
      ),
    ).toEqual([]);
  });

  it("refuses a profile chosen by an environment override", () => {
    writeManifest();
    expect(
      messages(releaseErrors({ profile: overridden, env: {}, repoRoot: root, ...BUILD })),
    ).toEqual([expect.stringMatching(/BRAND_PROFILE=local is set in your environment/)]);
  });

  it("rejects the example, sending the user to their chapter's own profile", () => {
    writeManifest("demo-example");
    const problems = releaseErrors({ profile: example(), env: {}, repoRoot: root, ...BUILD });
    expect(messages(problems)).toEqual([
      expect.stringMatching(/"example" is the example and can never be released/),
    ]);
    expect(problems[0]?.remedies?.[0]?.change).toMatch(/pnpm brand:init/);
  });

  it("rejects a local-only chapter, naming its demo- project", () => {
    writeManifest();
    const local = { ...chapter, localOnly: true };
    expect(messages(releaseErrors({ profile: local, env: {}, repoRoot: root, ...BUILD }))).toEqual([
      expect.stringMatching(
        /"local" is local-only \(project "jci-valle" exists only in the emulators\)/,
      ),
    ]);
  });

  it("rejects a GCP_PROJECT_ID that is not the profile's project", () => {
    writeManifest();
    expect(
      messages(
        releaseErrors({
          profile: chapter,
          env: { GCP_PROJECT_ID: "someone-else" },
          repoRoot: root,
          ...BUILD,
        }),
      ),
    ).toEqual([expect.stringMatching(/^GCP_PROJECT_ID "someone-else" is not profile "local"/)]);
  });

  it("requires the pull manifest, so a deploy ships only what brand:pull downloaded", () => {
    expect(
      messages(releaseErrors({ profile: chapter, env: {}, repoRoot: root, ...BUILD })),
    ).toEqual([
      "no brand/local/.pull-manifest.json: a deploy only uses files downloaded with brand:pull.",
    ]);
  });

  it("refuses a file edited after the pull, naming it", () => {
    writeManifest();
    appendFileSync(local("og-image.png"), "edited");
    writeFileSync(local("brand.toml"), `${readFileSync(local("brand.toml"), "utf8")}\n# note\n`);
    expect(
      messages(releaseErrors({ profile: chapter, env: {}, repoRoot: root, ...BUILD })),
    ).toEqual([
      "brand/local/brand.toml: changed after brand:pull; upload it with brand:push, or pull again",
      "brand/local/og-image.png: changed after brand:pull; upload it with brand:push, or pull again",
    ]);
  });

  it("refuses a seeded example file: only the bucket's files ship", () => {
    recordLocal(root, { source: "example" });
    const problems = messages(
      releaseErrors({ profile: chapter, env: {}, repoRoot: root, ...BUILD }),
    );
    expect(problems).toHaveLength(17);
    expect(problems).toContain(
      "brand/local/logo-main.png: the seeded example's copy, never pulled from the bucket",
    );
  });

  it("refuses a file the manifest does not record, or one deleted after the pull", () => {
    writeManifest();
    rmSync(local("spotlight/favicon-16.png"));
    const manifest = JSON.parse(readFileSync(local(".pull-manifest.json"), "utf8"));
    delete manifest.objects["logo-main.png"];
    writeFileSync(local(".pull-manifest.json"), JSON.stringify(manifest));
    expect(
      messages(releaseErrors({ profile: chapter, env: {}, repoRoot: root, ...BUILD })),
    ).toEqual([
      "brand/local/logo-main.png: not in brand/local/.pull-manifest.json, so not pulled from the bucket",
      "brand/local/spotlight/favicon-16.png: missing, though brand:pull downloaded it",
    ]);
  });

  it("refuses a manifest pulled for another project", () => {
    writeManifest("jci-other");
    expect(
      messages(releaseErrors({ profile: chapter, env: {}, repoRoot: root, ...BUILD })),
    ).toEqual([
      'brand/local/.pull-manifest.json: pulled from project "jci-other", but the profile deploys "jci-valle"',
    ]);
  });

  it("requires brand.toml from the bucket for every profile, one named by its caller too", () => {
    writeManifest();
    const file = local(".pull-manifest.json");
    const manifest = JSON.parse(readFileSync(file, "utf8")) as { objects: Record<string, unknown> };
    delete manifest.objects["brand.toml"];
    writeFileSync(file, JSON.stringify(manifest));
    writeChapter(root, { slug: TEST_CHAPTER, assets: false });
    const named = loadProfile({ repoRoot: root, profile: "jci-valle" });
    expect(messages(releaseErrors({ profile: named, env: {}, repoRoot: root, ...BUILD }))).toEqual([
      "brand/local/brand.toml: not in brand/local/.pull-manifest.json, so not pulled from the bucket",
    ]);
  });

  it("lists every problem at once", () => {
    const errors = messages(
      releaseErrors({
        profile: { ...example(), source: "override" },
        env: { GCP_PROJECT_ID: "someone-else" },
        repoRoot: root,
        ...BUILD,
      }),
    );
    expect(errors).toHaveLength(4);
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
          repoRoot: root,
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
          repoRoot: root,
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
    expect(releaseIdentity(chapter, root)).toEqual({
      profile: "local",
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
