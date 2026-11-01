import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ASSET_CONTRACT } from "../assets.ts";
import { BrandConfigError, loadProfile, type LoadedProfile } from "../load-profile.ts";
import { encodePng } from "../png.ts";
import { exampleRepo, localRepo, recordLocal, writeChapter } from "../test-profiles.ts";
import type { CommandRunner } from "./gcloud.ts";
import { cdProject } from "../deploy-identity.ts";
import { PULL_NEXT, pull, pullProject } from "./pull.ts";
import { push } from "./push.ts";
import { seedLocal } from "./seed.ts";

/** A copy into a destination under `failCopiesInto` writes half the bytes, then fails. */
const copyFault = vi.hoisted(() => ({ failCopiesInto: "" }));

vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs")>();
  const copyFileSync: typeof fs.copyFileSync = (source, destination, mode) => {
    const into = copyFault.failCopiesInto;
    if (into && String(destination).includes(into)) {
      fs.writeFileSync(destination, fs.readFileSync(source).subarray(0, 10));
      throw new Error("ENOSPC: no space left on device");
    }
    fs.copyFileSync(source, destination, mode);
  };
  return { ...fs, copyFileSync, default: { ...fs, copyFileSync } };
});

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
  copyFault.failCopiesInto = "";
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

  it("refuses a listing whose generation is not a number, before downloading", async () => {
    const listed = JSON.stringify(
      CONTRACT.map((name, index) => ({ name, generation: index === 3 ? "12 --flag" : "5" })),
    );
    const error = await errorOf(pull({ profile, repoRoot: root, run: fakeRunner(listed) }));
    expect(error.errors).toEqual([
      `gcloud listing of gs://${BUCKET} 3.generation: expected a generation number`,
    ]);
    expect(calls).toHaveLength(1);
  });

  it("never writes through a symlink in brand/local/, and changes nothing", async () => {
    recordLocal(root);
    const outside = mkdtempSync(join(tmpdir(), "brand-pull-outside-"));
    try {
      const target = join(outside, "precious.png");
      writeFileSync(target, "not yours");
      rmSync(local("og-image.png"));
      symlinkSync(target, local("og-image.png"));
      const before = read("logo-main.png");
      const error = await errorOf(pull({ profile, repoRoot: root, run: fakeRunner(listing()) }));
      expect(error.errors).toEqual([
        "brand/local/og-image.png: a symlink; brand:pull never writes through one",
      ]);
      expect(readFileSync(target, "utf8")).toBe("not yours");
      expect(read("logo-main.png")).toEqual(before);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("never writes into a symlinked folder of the contract", async () => {
    recordLocal(root);
    const outside = mkdtempSync(join(tmpdir(), "brand-pull-outside-"));
    try {
      rmSync(local("backstage"), { recursive: true });
      symlinkSync(outside, local("backstage"));
      const error = await errorOf(pull({ profile, repoRoot: root, run: fakeRunner(listing()) }));
      expect(error.errors).toEqual([
        "brand/local/backstage: a symlink; brand:pull never writes through one",
      ]);
      expect(readdirSync(outside)).toEqual([]);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("replaces each file whole: a copy failing part way leaves no half file, and the manifest records what was replaced", async () => {
    recordLocal(root);
    const recorded = JSON.parse(readFileSync(local(".pull-manifest.json"), "utf8"));
    const before = read("backstage/pwa-192x192.png");
    copyFault.failCopiesInto = join("brand", "local", "backstage");
    await expect(pull({ profile, repoRoot: root, run: fakeRunner(listing()) })).rejects.toThrow(
      /ENOSPC/,
    );
    expect(read("backstage/pwa-192x192.png")).toEqual(before);
    expect(readdirSync(local("backstage")).filter((name) => name.startsWith("."))).toEqual([]);
    expect(read("og-image.png")).toEqual(bucketImage("og-image.png"));
    const manifest = JSON.parse(readFileSync(local(".pull-manifest.json"), "utf8"));
    expect(manifest.objects["og-image.png"]).toMatchObject({
      source: "bucket",
      generation: "1004",
    });
    expect(manifest.objects["og-image.png"].sha256).not.toBe(
      recorded.objects["og-image.png"].sha256,
    );
    expect(manifest.objects["backstage/pwa-192x192.png"]).toEqual(
      recorded.objects["backstage/pwa-192x192.png"],
    );
  });

  it("follows the owner runbook: seed, copy brand.toml, pull the images, then push", async () => {
    const repo = exampleRepo("brand-runbook-");
    try {
      seedLocal({ repoRoot: repo, env: {} });
      const committed = writeChapter(repo, { slug: "jci-valle", assets: false });
      copyFileSync(join(committed, "brand.toml"), join(repo, "brand", "local", "brand.toml"));
      rmSync(committed, { recursive: true });
      const owner = loadProfile({ repoRoot: repo, env: {} });
      expect(owner).toMatchObject({ slug: "local", localOnly: false });

      const pulledImages = await pull({
        profile: owner,
        repoRoot: repo,
        run: fakeRunner(listing(IMAGES)),
      });
      expect(pulledImages.brandFile).toBe(false);

      const pushed: string[][] = [];
      const bucketRun: CommandRunner = async (_command, args) => {
        if (args[1] === "objects") {
          return JSON.stringify(
            CONTRACT.map((name, index) => ({ name, generation: String(3000 + index) })),
          );
        }
        pushed.push([args[2] ?? "", args.at(-1) ?? ""]);
        return "";
      };
      await push({ profile: owner, repoRoot: repo, run: bucketRun });
      expect(pushed).toEqual(
        // brand.toml create-only (the bucket has none); each image at the generation pulled.
        CONTRACT.map((path, index) => [
          `--if-generation-match=${path === "brand.toml" ? 0 : 1000 + index - 1}`,
          `gs://${BUCKET}/${path}`,
        ]),
      );
      const manifest = JSON.parse(
        readFileSync(join(repo, "brand", "local", ".pull-manifest.json"), "utf8"),
      );
      expect(
        Object.values(manifest.objects).every(
          (record) => (record as { source: string }).source === "bucket",
        ),
      ).toBe(true);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe("pullProject (CD: the project comes from FIREBASE_PROJECT_ID, not a local profile)", () => {
  it("pulls brand.toml and the images from <project>-brand-assets into a missing brand/local/", async () => {
    rmSync(local(), { recursive: true });
    const result = await pullProject({
      projectId: "jci-valle",
      repoRoot: root,
      run: fakeRunner(listing()),
    });
    expect(calls[0]).toContain(`gs://${BUCKET}/**`);
    expect(readFileSync(local("brand.toml"), "utf8")).toBe(bucketToml);
    expect(result.manifest).toMatchObject({ project: "jci-valle", bucket: BUCKET });
    expect(Object.values(result.manifest.objects).every(({ source }) => source === "bucket")).toBe(
      true,
    );
    // brand/ now selects the pulled brand.
    expect(loadProfile({ repoRoot: root, env: {} }).slug).toBe("local");
  });

  it("refuses a bucket without a brand.toml: CD has no other brand to build", async () => {
    rmSync(local(), { recursive: true });
    const error = await errorOf(
      pullProject({ projectId: "jci-valle", repoRoot: root, run: fakeRunner(listing(IMAGES)) }),
    );
    expect(error.errors).toEqual([
      `gs://${BUCKET}/brand.toml: missing from the bucket (upload it with brand:push)`,
    ]);
    expect(existsSync(local())).toBe(false);
  });

  it("refuses a bucket brand.toml that names another project", async () => {
    rmSync(local(), { recursive: true });
    bucketToml = bucketToml.replace('project = "jci-valle"', 'project = "jci-other"');
    const error = await errorOf(
      pullProject({ projectId: "jci-valle", repoRoot: root, run: fakeRunner(listing()) }),
    );
    expect(error.errors).toEqual([
      `gs://${BUCKET}/brand.toml: names project "jci-other", but this is the bucket of "jci-valle"`,
    ]);
    expect(existsSync(local("brand.toml"))).toBe(false);
  });

  it("refuses a bucket brand.toml that still holds [deploy], saying to fix brand/local/ and push", async () => {
    rmSync(local(), { recursive: true });
    bucketToml +=
      '\n[deploy]\nserviceAccount = "firebase-deployer@jci-valle.iam.gserviceaccount.com"\n';
    const error = await errorOf(
      pullProject({ projectId: "jci-valle", repoRoot: root, run: fakeRunner(listing()) }),
    );
    // The whole printout: the remedy is brand/local/ and brand:push, never editing the bucket.
    expect(error.message).toBe(
      [
        "Brand profile error:",
        `  - gs://${BUCKET}/brand.toml deploy: the [deploy] table is no longer read: CD reads its project and sign-in from the repository variables FIREBASE_PROJECT_ID and GCP_PROJECT_NUMBER (docs/ci-cd.md)`,
        "To fix:",
        "  - delete the [deploy] table from brand/local/brand.toml, then upload that file",
        "      pnpm brand:push   # in the repo root",
      ].join("\n"),
    );
    expect(existsSync(local("brand.toml"))).toBe(false);
  });

  it("refuses a bucket brand.toml that names another bucket", async () => {
    rmSync(local(), { recursive: true });
    bucketToml = bucketToml.replace(
      'project = "jci-valle"',
      'project = "jci-valle"\nassetsBucket = "jci-valle-other-assets"',
    );
    const error = await errorOf(
      pullProject({ projectId: "jci-valle", repoRoot: root, run: fakeRunner(listing()) }),
    );
    expect(error.errors).toEqual([
      `gs://${BUCKET}/brand.toml: names assetsBucket "jci-valle-other-assets", but it was pulled from ${BUCKET}`,
    ]);
  });

  it("refuses a brand/local/ pulled from another project, changing nothing", async () => {
    recordLocal(root, { project: "jci-other" });
    const before = readFileSync(local(".pull-manifest.json"), "utf8");
    const error = await errorOf(
      pullProject({ projectId: "jci-valle", repoRoot: root, run: fakeRunner(listing()) }),
    );
    expect(error.errors).toEqual([
      'brand/local/ holds the brand of project "jci-other" (its .pull-manifest.json), not "jci-valle"',
    ]);
    expect(calls).toEqual([]);
    expect(readFileSync(local(".pull-manifest.json"), "utf8")).toBe(before);
  });

  it("refuses a malformed or local-only project before calling gcloud", async () => {
    for (const projectId of ["Bad_Id", "jci-valle\nevil", "demo-valle"]) {
      await expect(
        pullProject({ projectId, repoRoot: root, run: fakeRunner(listing()) }),
      ).rejects.toThrow(BrandConfigError);
    }
    expect(calls).toEqual([]);
  });
});

describe("cdProject", () => {
  it("is BRAND_CD_PROJECT, which only CD's firebase-setup sets, else null", () => {
    expect(cdProject({})).toBeNull();
    expect(cdProject({ BRAND_CD_PROJECT: " " })).toBeNull();
    expect(cdProject({ BRAND_CD_PROJECT: "jci-valle" })).toBe("jci-valle");
  });

  it("leaves a member's pull in member mode when FIREBASE_PROJECT_ID is in their shell", () => {
    expect(cdProject({ FIREBASE_PROJECT_ID: "jci-valle" })).toBeNull();
    expect(cdProject({ FIREBASE_PROJECT_ID: "jci-other", BRAND_CD_PROJECT: "jci-valle" })).toBe(
      "jci-valle",
    );
  });
});
