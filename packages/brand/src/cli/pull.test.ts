import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ASSET_CONTRACT } from "../assets.ts";
import { BrandConfigError, REPO_ROOT, loadProfile } from "../load-profile.ts";
import { encodePng } from "../png.ts";
import type { CommandRunner } from "./gcloud.ts";
import { PULL_NEXT, pull } from "./pull.ts";

const BUCKET = "jci-oriente-brand-assets";
const profile = loadProfile({ repoRoot: REPO_ROOT, profile: "jci-oriente" });

let root: string;
let calls: string[][];

function listing(paths = ASSET_CONTRACT.map(({ path }) => path)) {
  return JSON.stringify([
    ...paths.map((name, index) => ({
      name,
      generation: String(1000 + index),
      md5_hash: `md5-${index}`,
      storage_url: `gs://${BUCKET}/${name}#${1000 + index}`,
    })),
    { name: "icon-master.svg", generation: "7", md5_hash: "x" },
  ]);
}

/** Answers the listing, and "downloads" each cp source as a PNG of the contract's size. */
function fakeRunner(listed: string, { badSize = "" } = {}): CommandRunner {
  return async (command, args) => {
    calls.push([command, ...args]);
    if (args[1] === "objects") return listed;
    if (args[1] === "cp") {
      const dest = args.at(-1) ?? "";
      for (const url of args.slice(2, -1)) {
        const name = url.slice(`gs://${BUCKET}/`.length).split("#")[0] ?? "";
        const spec = ASSET_CONTRACT.find(({ path }) => path === name);
        const size = name === badSize ? 1 : (spec?.width ?? 400);
        writeFileSync(join(dest, basename(name)), encodePng(size, spec?.height ?? 200, [1, 2, 3]));
      }
      return "";
    }
    throw new Error(`unexpected call: ${command} ${args.join(" ")}`);
  };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "brand-pull-"));
  mkdirSync(join(root, "node_modules"));
  calls = [];
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("pull", () => {
  it("lists the whole bucket, then copies the listed generations per directory", async () => {
    await pull({ profile, repoRoot: root, run: fakeRunner(listing()) });
    expect(calls[0]).toEqual([
      "gcloud",
      "storage",
      "objects",
      "list",
      `gs://${BUCKET}/**`,
      "--format=json",
    ]);
    const copies = calls.slice(1);
    expect(copies).toHaveLength(3);
    for (const copy of copies) expect(copy.slice(0, 3)).toEqual(["gcloud", "storage", "cp"]);
    const sources = copies.flatMap((copy) => copy.slice(3, -1));
    expect(sources).toHaveLength(ASSET_CONTRACT.length);
    expect(sources).toContain(`gs://${BUCKET}/spotlight/favicon-16.png#1004`);
    expect(sources.some((url) => url.includes("icon-master"))).toBe(false);
  });

  it("writes brand-assets/ with a manifest of profile, names, generations and md5", async () => {
    const manifest = await pull({ profile, repoRoot: root, run: fakeRunner(listing()) });
    const dir = join(root, "brand-assets");
    expect(JSON.parse(readFileSync(join(dir, "pull-manifest.json"), "utf8"))).toEqual(manifest);
    expect(manifest.profile).toBe("jci-oriente");
    expect(manifest.bucket).toBe(BUCKET);
    expect(manifest.objects[0]).toEqual({
      name: "logo-main.png",
      generation: "1000",
      md5: "md5-0",
    });
    expect(existsSync(join(dir, "backstage", "maskable-icon-512x512.png"))).toBe(true);
  });

  it("fails before downloading when a contract file is absent from the bucket", async () => {
    const paths = ASSET_CONTRACT.map(({ path }) => path).filter(
      (path) => path !== "og-image.png" && path !== "backstage/pwa-192x192.png",
    );
    const run = fakeRunner(listing(paths));
    const error = await pull({ profile, repoRoot: root, run }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BrandConfigError);
    expect(error instanceof BrandConfigError ? error.errors : []).toEqual([
      `gs://${BUCKET}/og-image.png: missing from the bucket (upload it with brand:push)`,
      `gs://${BUCKET}/backstage/pwa-192x192.png: missing from the bucket (upload it with brand:push)`,
    ]);
    expect(error instanceof BrandConfigError ? error.remedies : []).toEqual([
      { change: "upload the full set to the bucket (project owner)", run: "pnpm brand:push" },
    ]);
    expect(calls).toHaveLength(1);
    expect(existsSync(join(root, "brand-assets"))).toBe(false);
  });

  it("names the next step: check the pulled set with the release rules", () => {
    expect(PULL_NEXT).toEqual([
      { change: "check the pulled set with the release rules", run: "pnpm brand:check --release" },
    ]);
  });

  it("keeps the previous brand-assets/ when the downloaded set is invalid", async () => {
    const previous = join(root, "brand-assets");
    mkdirSync(previous);
    writeFileSync(join(previous, "marker.txt"), "previous");
    const run = fakeRunner(listing(), { badSize: "og-image.png" });
    await expect(pull({ profile, repoRoot: root, run })).rejects.toThrow(/og-image\.png/);
    expect(readdirSync(previous)).toEqual(["marker.txt"]);
    expect(readdirSync(join(root, "node_modules", ".cache"))).toEqual([]);
  });

  it("rejects a listing that is not the expected JSON", async () => {
    await expect(
      pull({ profile, repoRoot: root, run: fakeRunner('{"not":"a list"}') }),
    ).rejects.toThrow(BrandConfigError);
  });
});
