import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ASSET_CONTRACT } from "../assets.ts";
import { loadProfile } from "../load-profile.ts";
import { exampleRepo } from "../test-profiles.ts";
import { seedLocal } from "./seed.ts";

let root: string;
const local = () => join(root, "brand", "local");

beforeEach(() => {
  root = exampleRepo("brand-seed-");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("seedLocal", () => {
  it("seeds a missing brand/local/ with a minimal brand.toml on the example", () => {
    expect(seedLocal({ repoRoot: root, env: {} })).toBe(true);
    const text = readFileSync(join(local(), "brand.toml"), "utf8");
    expect(text.split("\n")[0]).toBe("#:schema ../brand.schema.json");
    const keys = text
      .split("\n")
      .filter((line) => /^\w+ = /.test(line))
      .map((line) => line.split(" = ")[0]);
    expect(keys).toEqual(["name", "city", "country", "project", "spotlight"]);
    expect(text).toContain("[colors]");
    const profile = loadProfile({ repoRoot: root, env: {} });
    expect(profile).toMatchObject({ slug: "local", source: "local", localOnly: true });
    expect(profile.brand.name).toBe("JCI Ejemplo");
    expect(profile.brand.firebase.projectId).toBe("demo-example");
  });

  it("copies the example's 16 images, byte for byte", () => {
    seedLocal({ repoRoot: root, env: {} });
    for (const { path } of ASSET_CONTRACT) {
      expect(readFileSync(join(local(), path))).toEqual(
        readFileSync(join(root, "brand", "example", "assets", path)),
      );
    }
  });

  it("records every file with source example, its hashes and no generation", () => {
    seedLocal({ repoRoot: root, env: {} });
    const manifest = JSON.parse(readFileSync(join(local(), ".pull-manifest.json"), "utf8"));
    expect(manifest).toMatchObject({
      version: 1,
      project: "demo-example",
      bucket: "demo-example-brand-assets",
    });
    expect(Object.keys(manifest.objects)).toEqual([
      "brand.toml",
      ...ASSET_CONTRACT.map(({ path }) => path),
    ]);
    for (const record of Object.values(manifest.objects)) {
      expect(record).toEqual({
        md5: expect.stringMatching(/^[A-Za-z0-9+/]{22}==$/),
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        source: "example",
      });
    }
  });

  it("never touches an existing brand/local/, even an empty one", () => {
    mkdirSync(local());
    writeFileSync(join(local(), "notes.txt"), "mine");
    expect(seedLocal({ repoRoot: root, env: {} })).toBe(false);
    expect(readdirSync(local())).toEqual(["notes.txt"]);
    rmSync(join(local(), "notes.txt"));
    expect(seedLocal({ repoRoot: root, env: {} })).toBe(false);
    expect(readdirSync(local())).toEqual([]);
  });

  it("seeds nothing under CI, where the committed chapter stays selected", () => {
    expect(seedLocal({ repoRoot: root, env: { CI: "true" } })).toBe(false);
    expect(existsSync(local())).toBe(false);
  });
});
