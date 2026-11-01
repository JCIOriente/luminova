import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeAssetSet } from "../asset-set.ts";
import { ASSET_CONTRACT } from "../assets.ts";
import { REPO_ROOT, loadProfile } from "../load-profile.ts";
import { PULLED_ASSETS_DIR } from "../release.ts";
import { applyProfile } from "./apply.ts";
import { SECTION_TITLES, check, checkNext } from "./check.ts";
import { rowRemedies, type CheckRow } from "./rows.ts";
import { CommandError, commandFailure, type CommandRunner } from "./gcloud.ts";

const BUCKET = "jci-oriente-brand-assets";
/** A chapter's own profile: the example's values under another slug. */
const CHAPTER = "jci-valle";
const TOOLS = { nodeVersion: "24.15.0", platform: "linux" } as const;
const ENV = { CLOUDSDK_CONFIG: "" };

let root: string;
let calls: string[][];
let responses: Map<string, string | Error>;

const run: CommandRunner = async (command, args) => {
  calls.push([command, ...args]);
  const key = [command, ...args].join(" ");
  for (const [prefix, response] of responses) {
    if (!key.startsWith(prefix)) continue;
    if (response instanceof Error) throw response;
    return response;
  }
  throw new CommandError(`${key} failed: unexpected in test`);
};

function statusOf(rows: CheckRow[]): Record<string, CheckRow["status"]> {
  return Object.fromEntries(rows.map(({ check, status }) => [check, status]));
}

function rowFor(rows: CheckRow[], check: string): CheckRow {
  const row = rows.find((candidate) => candidate.check === check);
  if (!row) throw new Error(`no row ${check}`);
  return row;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "brand-check-"));
  ENV.CLOUDSDK_CONFIG = root;
  writeFileSync(join(root, "application_default_credentials.json"), "{}");
  cpSync(join(REPO_ROOT, "brand"), join(root, "brand"), { recursive: true });
  const chapter = join(root, "brand", CHAPTER);
  cpSync(join(root, "brand/jci-oriente"), chapter, { recursive: true });
  // Images live in brand-assets/ here; the profile's own would add the other-folder note.
  rmSync(join(chapter, "assets"), { recursive: true });
  const file = join(chapter, "brand.json");
  writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), slug: CHAPTER }));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ engines: { node: ">=24.15.0" }, packageManager: "pnpm@11.5.1" }),
  );
  writeAssetSet(join(root, PULLED_ASSETS_DIR));
  applyProfile({
    profile: loadProfile({ repoRoot: root, profile: CHAPTER }),
    repoRoot: root,
    env: {},
  });
  calls = [];
  responses = new Map<string, string | Error>([
    ["gcloud auth list", "owner@example.org\n"],
    ["gcloud storage objects list", `${ASSET_CONTRACT.map(({ path }) => path).join("\n")}\n`],
    ["pnpm --version", "11.5.1\n"],
    ["java --version", "openjdk 21.0.5 2024-10-15 LTS\n"],
    ["firebase --version", "15.22.1\n"],
    ["gh --version", "gh version 2.103.0 (2026-10-21)\n"],
    ["gh auth status", "  ✓ Logged in to github.com account octo (keyring)\n"],
    ["gcloud --version", "Google Cloud SDK 586.0.0\n"],
    ["firebase login:list", "Logged in as owner@example.org\n"],
  ]);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const sectionsOf = (
  options: { env?: Record<string, string>; nodeVersion?: string; platform?: NodeJS.Platform } = {},
) =>
  check({ ...TOOLS, repoRoot: root, run, ...options, env: { ...ENV, ...options.env } }).then(
    ({ sections }) => sections,
  );

const diagnose = (options: Parameters<typeof sectionsOf>[0] = {}) =>
  sectionsOf(options).then((sections) => sections.flatMap(({ rows }) => rows));

describe("check", () => {
  it("reports every row, all passing, on a ready checkout", async () => {
    const rows = await diagnose();
    expect(statusOf(rows)).toEqual({
      profile: "ok",
      "brand.json": "ok",
      "site content": "ok",
      images: "ok",
      "gcloud ADC": "ok",
      "firebase account": "ok",
      ".firebaserc": "ok",
      "gcloud account": "ok",
      bucket: "ok",
      selection: "ok",
      "CD identity": "ok",
      node: "ok",
      pnpm: "ok",
      java: "ok",
      firebase: "ok",
      gh: "ok",
      "gh account": "ok",
      gcloud: "ok",
    });
    expect(rowFor(rows, "selection").detail).toBe(
      `brand/ selects "${CHAPTER}" (the chapter profile in brand/)`,
    );
    expect(rowFor(rows, "profile").detail).toBe(`brand/${CHAPTER}/`);
    expect(rowFor(rows, "CD identity").detail).toBe(
      "firebase-deployer@jci-oriente.iam.gserviceaccount.com",
    );
    expect(rowFor(rows, "gcloud account").detail).toBe("owner@example.org");
    expect(rowFor(rows, "bucket").detail).toMatch(`all 16 images in gs://${BUCKET}`);
    expect(rowFor(rows, "images").detail).toBe("all 16 valid");
  });

  it("only ever reads: the exact external commands it runs", async () => {
    await diagnose();
    expect(calls.map((call) => call.join(" ")).sort()).toEqual(
      [
        "firebase --version",
        "firebase login:list",
        "gcloud --version",
        "gcloud auth list --filter=status:ACTIVE --format=value(account)",
        `gcloud storage objects list gs://${BUCKET}/** --format=value(name)`,
        "gh --version",
        "gh auth status --active",
        "java --version",
        "pnpm --version",
      ].sort(),
    );
  });

  it("keeps going after a failure: gcloud missing fails two rows, the rest still report", async () => {
    responses.set(
      "gcloud auth list",
      new CommandError("gcloud auth list failed: spawn gcloud ENOENT"),
    );
    responses.set(
      "gcloud storage objects list",
      new CommandError("gcloud storage objects list failed: spawn gcloud ENOENT"),
    );
    const rows = await diagnose();
    expect(rows).toHaveLength(18);
    expect(statusOf(rows)).toMatchObject({ "gcloud account": "fail", bucket: "fail", pnpm: "ok" });
    expect(rowFor(rows, "gcloud account").detail).toMatch(/ENOENT/);
  });

  it("fails the account row when nobody is signed in", async () => {
    responses.set("gcloud auth list", "");
    expect(rowFor(await diagnose(), "gcloud account")).toMatchObject({
      status: "fail",
      detail: "not signed in",
    });
  });

  it("names the images missing from the bucket", async () => {
    responses.set("gcloud storage objects list", "logo-main.png\n");
    const row = rowFor(await diagnose(), "bucket");
    expect(row.status).toBe("fail");
    expect(row.detail).toMatch(/15 of 16 images missing/);
  });

  it("fails a stale .firebaserc with the command that fixes it", async () => {
    writeFileSync(join(root, ".firebaserc"), "{}");
    expect(rowFor(await diagnose(), ".firebaserc")).toMatchObject({
      status: "fail",
      detail: `not generated from "${CHAPTER}"`,
    });
  });

  it("names each image with a problem in the images section, and the folder in its title", async () => {
    rmSync(join(root, PULLED_ASSETS_DIR, "og-image.png"));
    const images = (await sectionsOf())[2];
    expect(images?.title).toBe("Images in brand-assets/");
    expect(images?.rows.map(({ check: name, status }) => `${name} ${status}`)).toEqual([
      "og-image.png fail",
      "images ok",
    ]);
  });

  it("warns that brand:push will not use a BRAND_ASSETS_DIR the images section read", async () => {
    writeAssetSet(join(root, "elsewhere"));
    const images = (await sectionsOf({ env: { BRAND_ASSETS_DIR: "elsewhere" } }))[2];
    expect(images?.title).toBe("Images in elsewhere/");
    expect(images?.rows).toContainEqual(
      expect.objectContaining({
        check: "BRAND_ASSETS_DIR",
        status: "warn",
        detail: expect.stringMatching(/brand:push/),
        remedies: [expect.objectContaining({ run: "unset BRAND_ASSETS_DIR" })],
      }),
    );
  });

  it("names the build that makes the site-content schema loadable in a fresh clone", async () => {
    const unbuilt = Object.assign(new Error("Cannot find module 'types/dist/index.js'"), {
      code: "ERR_MODULE_NOT_FOUND",
    });
    const { sections } = await check({
      ...TOOLS,
      repoRoot: root,
      run,
      env: ENV,
      importSchema: () => Promise.reject(unbuilt),
    });
    expect(
      rowFor(
        sections.flatMap(({ rows }) => rows),
        "site content",
      ),
    ).toMatchObject({
      status: "fail",
      detail: expect.stringMatching(/^cannot load the site-content schema/),
      remedies: [
        {
          change: expect.stringMatching(/after pnpm install/),
          run: "pnpm turbo run build --filter=@luminova/types",
        },
      ],
    });
  });

  it("fails two chapter profiles once, with both ways out, and skips the profile", async () => {
    cpSync(join(root, "brand/fixture"), join(root, "brand/jci-andina"), { recursive: true });
    const rows = await diagnose();
    expect(statusOf(rows)).toMatchObject({ selection: "fail", profile: "skip", bucket: "skip" });
    expect(rowFor(rows, "selection").detail).toMatch(/brand\/ holds 2 chapter profiles/);
    expect(rowFor(rows, "selection").remedies?.[0]?.change).toMatch(/^delete the folder/);
  });

  it("warns when a BRAND_PROFILE override in the shell differs from brand/", async () => {
    const rows = await diagnose({ env: { BRAND_PROFILE: "fixture" } });
    expect(rowFor(rows, "selection")).toMatchObject({
      status: "warn",
      detail: `brand/ selects "${CHAPTER}" (the chapter profile in brand/), but BRAND_PROFILE=fixture overrides it`,
      remedies: [expect.objectContaining({ run: "unset BRAND_PROFILE" })],
    });
    expect(rowFor(rows, "profile").detail).toBe("brand/fixture/ (from BRAND_PROFILE)");
  });

  it("warns that a leftover luminova.json is no longer read", async () => {
    writeFileSync(join(root, "luminova.json"), JSON.stringify({ profile: "fixture" }));
    const rows = await diagnose();
    expect(rowFor(rows, "selection")).toMatchObject({
      status: "warn",
      detail: expect.stringMatching(/, but luminova\.json is no longer read$/),
      remedies: [expect.objectContaining({ run: "git rm luminova.json" })],
    });
    expect(rowFor(rows, "profile").detail).toBe(`brand/${CHAPTER}/`);
  });

  it("warns, without failing, when the profile has no CD identity", async () => {
    const file = join(root, "brand", CHAPTER, "brand.json");
    const brand = JSON.parse(readFileSync(file, "utf8"));
    delete brand.deploy;
    writeFileSync(file, JSON.stringify(brand));
    expect(rowFor(await diagnose(), "CD identity")).toMatchObject({
      status: "warn",
      remedies: [expect.objectContaining({ run: "pnpm brand:provision" })],
    });
  });

  it("skips the profile-dependent rows when the profile is missing, without throwing", async () => {
    const rows = await diagnose({ env: { BRAND_PROFILE: "nope" } });
    expect(statusOf(rows)).toMatchObject({
      profile: "fail",
      "brand.json": "skip",
      images: "skip",
      ".firebaserc": "skip",
      bucket: "skip",
      "gcloud account": "ok",
      "CD identity": "skip",
    });
    expect(calls.some((call) => call.includes("objects"))).toBe(false);
  });

  it("reports unreadable files as failing rows instead of throwing", async () => {
    rmSync(join(root, "brand", CHAPTER, "brand.json"));
    mkdirSync(join(root, "brand", CHAPTER, "brand.json"));
    rmSync(join(root, ".firebaserc"));
    mkdirSync(join(root, ".firebaserc"));
    const rows = await diagnose();
    expect(statusOf(rows)).toMatchObject({
      profile: "ok",
      "brand.json": "fail",
      ".firebaserc": "skip",
    });
    expect(rowFor(rows, "brand.json").detail).toMatch(/cannot read/);
  });

  it("fails an unreadable .firebaserc as its own row", async () => {
    rmSync(join(root, ".firebaserc"));
    mkdirSync(join(root, ".firebaserc"));
    const rows = await diagnose();
    expect(rowFor(rows, ".firebaserc")).toMatchObject({
      status: "fail",
      detail: expect.stringMatching(/EISDIR/),
    });
    expect(rows).toHaveLength(18);
  });

  it("fails the schema row with the schema errors", async () => {
    writeFileSync(join(root, "brand", CHAPTER, "brand.json"), JSON.stringify({ slug: CHAPTER }));
    const rows = await diagnose();
    expect(statusOf(rows)).toMatchObject({ profile: "ok", "brand.json": "fail", images: "skip" });
    expect(rowFor(rows, "brand.json").detail).toMatch(/name/);
  });

  it("stops at the WSL 2 row on native Windows", async () => {
    const rows = await diagnose({ platform: "win32" });
    expect(rows).toEqual([expect.objectContaining({ check: "windows", status: "fail" })]);
    expect(calls).toEqual([]);
  });

  it("fails a Node older than engines.node", async () => {
    expect(rowFor(await diagnose({ nodeVersion: "24.10.0" }), "node")).toMatchObject({
      status: "fail",
      detail: "24.10.0 (needs >=24.15.0)",
    });
  });

  it("warns, without failing, on a pnpm other than packageManager", async () => {
    responses.set("pnpm --version", "11.4.0\n");
    expect(rowFor(await diagnose(), "pnpm")).toMatchObject({
      status: "warn",
      detail: "11.4.0 (packageManager pins 11.5.1)",
    });
  });

  describe("remedies", () => {
    const runsOf = (row: CheckRow) => (row.remedies ?? []).map(({ run }) => run);

    it("says how to fix each failing row", async () => {
      writeFileSync(join(root, ".firebaserc"), "{}");
      responses.set("gcloud auth list", "");
      responses.set("gcloud storage objects list", "logo-main.png\n");
      const rows = await diagnose({ nodeVersion: "24.10.0" });
      expect(runsOf(rowFor(rows, ".firebaserc"))).toEqual(["pnpm brand:apply"]);
      expect(runsOf(rowFor(rows, "gcloud account"))).toEqual(["gcloud auth login"]);
      expect(runsOf(rowFor(rows, "bucket"))).toEqual(["pnpm brand:push"]);
      expect(runsOf(rowFor(rows, "node"))).toEqual([
        expect.stringMatching(/install\.sh \| bash$/),
        "nvm install && nvm use",
      ]);
    });

    it("sends a bucket that does not exist to brand:provision", async () => {
      responses.set(
        "gcloud storage objects list",
        commandFailure("gcloud", ["storage", "objects", "list"], {
          stderr: "gs://x not found: 404.",
        }),
      );
      expect(runsOf(rowFor(await diagnose(), "bucket"))).toEqual(["pnpm brand:provision"]);
    });

    it("says how to install a missing CLI, and skips its sign-in", async () => {
      responses.set(
        "gcloud auth list",
        commandFailure("gcloud", ["auth", "list"], { code: "ENOENT", stderr: "" }),
      );
      responses.set(
        "gcloud --version",
        commandFailure("gcloud", ["--version"], { code: "ENOENT", stderr: "" }),
      );
      const rows = await diagnose();
      expect(rowFor(rows, "gcloud").remedies?.[0]?.change).toMatch(/install the Google Cloud CLI/);
      expect(rowFor(rows, "gcloud account")).toMatchObject({
        status: "skip",
        detail: "needs gcloud",
      });
    });

    it("lists the fixes once, in row order", async () => {
      responses.set(
        "gcloud storage objects list",
        commandFailure("gcloud", ["storage", "objects", "list"], {
          stderr: "gs://x not found: 404.",
        }),
      );
      responses.set("pnpm --version", "11.4.0\n");
      const fixes = rowRemedies(await diagnose({ env: { BRAND_PROFILE: "fixture" } })).map(
        ({ change, run }) => run ?? change,
      );
      expect(fixes).toEqual([
        "corepack enable && corepack install",
        "unset BRAND_PROFILE",
        "pnpm brand:apply",
        // The fixture keeps its own images, which brand-assets/ outranks here.
        "keep the images you edit in brand-assets/, or empty brand-assets/ to use brand/fixture/assets/ again",
      ]);
    });

    it("sends a connected profile without CD's sign-in to brand:provision, not to a merge", () => {
      const connected = loadProfile({ repoRoot: root, profile: CHAPTER });
      const brand = { ...connected.brand, deploy: undefined };
      expect(checkNext({ ...connected, brand }).map(({ run }) => run)).toEqual([
        "pnpm brand:provision",
      ]);
    });

    it("after a passing run, offers going live as a choice", () => {
      const connected = loadProfile({ repoRoot: root, profile: CHAPTER });
      expect(checkNext(connected).map(({ change, run }) => run ?? change)).toEqual([
        expect.stringMatching(
          /^when you are ready to go live: merge brand\/jci-valle\/ to main in your fork/,
        ),
        "gh workflow run deploy.yml -f surface=all",
      ]);
      const local = loadProfile({ repoRoot: root, profile: "fixture" });
      expect(checkNext(local).map(({ run }) => run)).toEqual(["pnpm dev", "pnpm brand:init"]);
    });

    it("shows going live as one row for a local-only profile, without calling gcloud", async () => {
      // A chapter fresh from brand:init without a Firebase project: a demo- project.
      rmSync(join(root, "brand", CHAPTER), { recursive: true });
      cpSync(join(root, "brand/fixture"), join(root, "brand/jci-valle"), { recursive: true });
      const file = join(root, "brand/jci-valle/brand.json");
      writeFileSync(
        file,
        JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), slug: "jci-valle" }),
      );
      const rows = await diagnose();
      expect(rowFor(rows, "profile").detail).toBe("brand/jci-valle/");
      expect(rows.at(-1)).toMatchObject({
        check: "going live",
        status: "skip",
        detail: expect.stringMatching(/local-only profile.*brand:init/),
      });
      expect(rows.map(({ check: name }) => name)).not.toContain("bucket");
      expect(calls.filter(([command]) => command === "gcloud" || command === "gh")).toEqual([]);
    });

    it("checks going live for the example, which upstream deploys, but only warns", async () => {
      // An untouched clone: no chapter profile, so brand/ selects the example. Its cloud is
      // upstream's, so gh, gcloud and the bucket fail here and must not fail the check.
      rmSync(join(root, "brand", CHAPTER), { recursive: true });
      applyProfile({
        profile: loadProfile({ repoRoot: root, profile: "jci-oriente" }),
        repoRoot: root,
        env: {},
      });
      responses.set("gh auth status", new CommandError("gh auth status failed: not signed in"));
      responses.set(
        "gcloud storage objects list",
        new CommandError("gcloud storage objects list failed: 403 Forbidden"),
      );
      const { sections, profile } = await check({ ...TOOLS, repoRoot: root, run, env: ENV });
      const rows = sections.flatMap(({ rows: sectionRows }) => sectionRows);
      expect(rowFor(rows, "selection").detail).toMatch(/selects "jci-oriente" \(the example/);
      const live = sections.at(-1)?.rows ?? [];
      expect(live[0]).toMatchObject({ check: "example", status: "warn" });
      expect(live.map(({ check: name }) => name)).toContain("bucket");
      expect(live.filter(({ status }) => status === "warn").length).toBeGreaterThan(1);
      expect(rows.filter(({ status }) => status === "fail")).toEqual([]);
      if (!profile) throw new Error("expected the example profile");
      expect(checkNext(profile).map(({ run: command }) => command)).toEqual([
        "pnpm dev",
        "pnpm brand:init",
      ]);
    });

    it("orders the sections and rows as the fixes must happen", async () => {
      const sections = await sectionsOf();
      expect(
        sections.map(({ title, rows }) => [title, rows.map(({ check: name }) => name)]),
      ).toEqual([
        [SECTION_TITLES.tools, ["node", "pnpm", "java", "firebase"]],
        [
          SECTION_TITLES.chapter,
          ["selection", "profile", "brand.json", "site content", ".firebaserc"],
        ],
        ["Images in brand-assets/", ["images"]],
        [
          SECTION_TITLES.live,
          [
            "CD identity",
            "gh",
            "gh account",
            "gcloud",
            "gcloud account",
            "gcloud ADC",
            "firebase account",
            "bucket",
          ],
        ],
      ]);
    });
  });
});
