import {
  appendFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ASSET_CONTRACT } from "../assets.ts";
import { BrandConfigError, loadProfile, type LoadedProfile } from "../load-profile.ts";
import { encodePng } from "../png.ts";
import { localRepo, recordLocal } from "../test-profiles.ts";
import type { CommandRunner } from "./gcloud.ts";
import { PULL_NEXT, pull } from "./pull.ts";

const BUCKET = "jci-valle-brand-assets";
const IMAGES = ASSET_CONTRACT.map(({ path }) => path);
const CONTRACT = ["brand.toml", ...IMAGES];

let root: string;
let profile: LoadedProfile;
let calls: string[][];
let bucketToml: string;

const local = (path = "") => join(root, "brand", "local", path);
const read = (path: string) => readFileSync(local(path));

function listing(paths = CONTRACT) {
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

/** The bucket's copy of an image: the contract's size, a colour no local file has. */
const bucketImage = (path: string, size?: number) => {
  const spec = ASSET_CONTRACT.find((candidate) => candidate.path === path);
  return encodePng(size ?? spec?.width ?? 400, spec?.height ?? 200, [9, 9, 9]);
};

/** Answers the listing, and "downloads" each cp source into the destination folder. */
function fakeRunner(listed: string, { badSize = "" } = {}): CommandRunner {
  return async (command, args) => {
    calls.push([command, ...args]);
    if (args[1] === "objects") return listed;
    if (args[1] === "cp") {
      const dest = args.at(-1) ?? "";
      for (const url of args.slice(2, -1)) {
        const name = url.slice(`gs://${BUCKET}/`.length).split("#")[0] ?? "";
        const body =
          name === "brand.toml" ? bucketToml : bucketImage(name, name === badSize ? 1 : undefined);
        writeFileSync(join(dest, basename(name)), body);
      }
      return "";
    }
    throw new Error(`unexpected call: ${command} ${args.join(" ")}`);
  };
}

/** A confirm that records each question and gives `answer`. */
function confirmer(answer: boolean) {
  const asked: string[] = [];
  const confirm = async (question: string) => {
    asked.push(question);
    return answer;
  };
  return { asked, confirm };
}

beforeEach(() => {
  root = localRepo("brand-pull-");
  profile = loadProfile({ repoRoot: root, env: {} });
  bucketToml = `${readFileSync(local("brand.toml"), "utf8")}\n# from the bucket\n`;
  calls = [];
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const errorOf = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error("expected a failure");
    },
    (error: unknown) => {
      if (error instanceof BrandConfigError) return error;
      throw error;
    },
  );

describe("pull", () => {
  it("lists the whole bucket, then copies the listed generations per directory", async () => {
    recordLocal(root);
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
    expect(sources).toHaveLength(CONTRACT.length);
    expect(sources).toContain(`gs://${BUCKET}/brand.toml#1000`);
    expect(sources).toContain(`gs://${BUCKET}/spotlight/favicon-16.png#1005`);
    expect(sources.some((url) => url.includes("icon-master"))).toBe(false);
  });

  it("replaces unchanged and absent files without asking, and records them from the bucket", async () => {
    recordLocal(root, { source: "example" });
    rmSync(local("og-image.png"));
    const { asked, confirm } = confirmer(false);
    const result = await pull({ profile, repoRoot: root, run: fakeRunner(listing()), confirm });
    expect(asked).toEqual([]);
    expect(result.brandFile).toBe(true);
    expect(read("og-image.png")).toEqual(bucketImage("og-image.png"));
    expect(readFileSync(local("brand.toml"), "utf8")).toBe(bucketToml);
    const manifest = JSON.parse(readFileSync(local(".pull-manifest.json"), "utf8"));
    expect(manifest).toEqual(result.manifest);
    expect(manifest).toMatchObject({ version: 1, project: "jci-valle", bucket: BUCKET });
    expect(Object.keys(manifest.objects)).toEqual(CONTRACT);
    expect(manifest.objects["logo-main.png"]).toEqual({
      generation: "1001",
      md5: expect.stringMatching(/==$/),
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      source: "bucket",
    });
  });

  it("keeps every file outside the contract: the icon master, notes", async () => {
    recordLocal(root);
    writeFileSync(local("icon-master.svg"), "<svg/>");
    writeFileSync(local("notes.txt"), "mine");
    await pull({ profile, repoRoot: root, run: fakeRunner(listing()) });
    expect(readFileSync(local("icon-master.svg"), "utf8")).toBe("<svg/>");
    expect(readFileSync(local("notes.txt"), "utf8")).toBe("mine");
  });

  it("asks once before replacing files changed since the last pull; no changes nothing", async () => {
    recordLocal(root);
    appendFileSync(local("og-image.png"), "edited");
    appendFileSync(local("brand.toml"), "# my note\n");
    const before = readFileSync(local(".pull-manifest.json"), "utf8");
    const edited = read("og-image.png");
    const { asked, confirm } = confirmer(false);
    const error = await errorOf(
      pull({ profile, repoRoot: root, run: fakeRunner(listing()), confirm }),
    );
    expect(asked).toEqual([
      "These files in brand/local/ changed since the last pull, push or seed:\n  brand.toml\n  og-image.png\nReplace these 2 files with the bucket's copy?",
    ]);
    expect(error.errors).toEqual([
      "brand:pull changed nothing: you kept your 2 changed files (brand.toml, og-image.png).",
    ]);
    expect(read("og-image.png")).toEqual(edited);
    expect(read("logo-main.png")).not.toEqual(bucketImage("logo-main.png"));
    expect(readFileSync(local(".pull-manifest.json"), "utf8")).toBe(before);
  });

  it("replaces the changed files on yes", async () => {
    recordLocal(root);
    appendFileSync(local("og-image.png"), "edited");
    const { asked, confirm } = confirmer(true);
    const result = await pull({ profile, repoRoot: root, run: fakeRunner(listing()), confirm });
    expect(asked).toHaveLength(1);
    expect(read("og-image.png")).toEqual(bucketImage("og-image.png"));
    expect(result.manifest.objects["og-image.png"]?.source).toBe("bucket");
  });

  it("refuses without a terminal, listing the changed files, and changes nothing", async () => {
    recordLocal(root);
    appendFileSync(local("spotlight/favicon-16.png"), "edited");
    const error = await errorOf(pull({ profile, repoRoot: root, run: fakeRunner(listing()) }));
    expect(error.errors).toEqual([
      "brand/local/ files changed since the last pull, push or seed: spotlight/favicon-16.png. brand:pull asks before replacing them, so it needs a terminal.",
    ]);
    expect(read("logo-main.png")).not.toEqual(bucketImage("logo-main.png"));
  });

  it("counts a file the manifest never recorded as changed", async () => {
    const { asked, confirm } = confirmer(true);
    await pull({ profile, repoRoot: root, run: fakeRunner(listing()), confirm });
    expect(asked[0]).toMatch(/Replace these 17 files with the bucket's copy\?$/);
  });

  it("asks nothing for a local file that already is the bucket's copy", async () => {
    recordLocal(root);
    writeFileSync(local("og-image.png"), bucketImage("og-image.png"));
    const { asked, confirm } = confirmer(false);
    await pull({ profile, repoRoot: root, run: fakeRunner(listing()), confirm });
    expect(asked).toEqual([]);
  });

  it("pulls only the images while the bucket holds no brand.toml, keeping the local one", async () => {
    recordLocal(root, { source: "example" });
    const toml = readFileSync(local("brand.toml"), "utf8");
    const before = JSON.parse(readFileSync(local(".pull-manifest.json"), "utf8"));
    const result = await pull({ profile, repoRoot: root, run: fakeRunner(listing(IMAGES)) });
    expect(result.brandFile).toBe(false);
    expect(readFileSync(local("brand.toml"), "utf8")).toBe(toml);
    expect(calls.flatMap((call) => call.slice(3, -1))).not.toContain(
      `gs://${BUCKET}/brand.toml#1000`,
    );
    expect(result.manifest.objects["brand.toml"]).toEqual(before.objects["brand.toml"]);
    expect(result.manifest.objects["logo-main.png"]?.source).toBe("bucket");
  });

  it("pulls into a missing brand/local/, as CD does for a committed chapter", async () => {
    rmSync(local(), { recursive: true });
    await pull({ profile, repoRoot: root, run: fakeRunner(listing(IMAGES)) });
    expect(readdirSync(local()).sort()).toEqual(
      [".pull-manifest.json", "backstage", "logo-main.png", "logo-on-dark.png"]
        .concat(["logo-on-primary.png", "og-image.png", "spotlight"])
        .sort(),
    );
  });

  it("refuses a bucket brand.toml that does not load, changing nothing", async () => {
    recordLocal(root);
    bucketToml = 'name = "JCI Valle"\nunknown = 1\n';
    const error = await errorOf(pull({ profile, repoRoot: root, run: fakeRunner(listing()) }));
    expect(error.errors.join("\n")).toMatch(/gs:\/\/jci-valle-brand-assets\/brand\.toml/);
    expect(readFileSync(local("brand.toml"), "utf8")).not.toBe(bucketToml);
  });

  it("refuses a bucket brand.toml of another project", async () => {
    recordLocal(root);
    bucketToml = bucketToml.replace('project = "jci-valle"', 'project = "jci-other"');
    const error = await errorOf(pull({ profile, repoRoot: root, run: fakeRunner(listing()) }));
    expect(error.errors).toEqual([
      `gs://${BUCKET}/brand.toml: names project "jci-other", but this is the bucket of "jci-valle"`,
    ]);
  });

  it("fails before downloading when a contract image is absent from the bucket", async () => {
    const paths = CONTRACT.filter(
      (path) => path !== "og-image.png" && path !== "backstage/pwa-192x192.png",
    );
    const error = await errorOf(pull({ profile, repoRoot: root, run: fakeRunner(listing(paths)) }));
    expect(error.errors).toEqual([
      `gs://${BUCKET}/og-image.png: missing from the bucket (upload it with brand:push)`,
      `gs://${BUCKET}/backstage/pwa-192x192.png: missing from the bucket (upload it with brand:push)`,
    ]);
    expect(calls).toHaveLength(1);
  });

  it("names the next step: deploy the sites with the downloaded images", () => {
    expect(PULL_NEXT).toEqual([
      {
        change: "deploy the sites with these images (project owner)",
        run: "pnpm deploy:hosting",
      },
    ]);
  });

  it("changes nothing when the downloaded set is invalid", async () => {
    recordLocal(root);
    const before = read("og-image.png");
    const run = fakeRunner(listing(), { badSize: "og-image.png" });
    await expect(pull({ profile, repoRoot: root, run })).rejects.toThrow(/og-image\.png/);
    expect(read("og-image.png")).toEqual(before);
    expect(readdirSync(join(root, "node_modules", ".cache"))).toEqual([]);
  });

  it("rejects a listing that is not the expected JSON", async () => {
    await expect(
      pull({ profile, repoRoot: root, run: fakeRunner('{"not":"a list"}') }),
    ).rejects.toThrow(BrandConfigError);
    expect(existsSync(local(".pull-manifest.json"))).toBe(false);
  });
});
