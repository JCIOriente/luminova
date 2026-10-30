import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ASSET_CONTRACT } from "../assets.ts";
import { EXAMPLE_PROFILE, loadProfile } from "../load-profile.ts";
import { TEST_CHAPTER, exampleRepo, writeChapter } from "../test-profiles.ts";
import { applyProfile } from "./apply.ts";
import { SECTION_TITLES, check, checkNext } from "./check.ts";
import { rowRemedies, type CheckRow } from "./rows.ts";
import { CommandError, commandFailure, type CommandRunner } from "./gcloud.ts";

const BUCKET = "jci-valle-brand-assets";
/** A connected chapter with CD's sign-in, in brand/local/. */
const CHAPTER = "local";
const TOOLS = { nodeVersion: "24.15.0", platform: "linux" } as const;
const ENV = { CLOUDSDK_CONFIG: "" };

let root: string;
let calls: string[][];
let responses: Map<string, string | Error>;

/** What `gcloud storage objects list --format=json` prints for these object names. */
const listingOf = (names: readonly string[]) =>
  JSON.stringify(names.map((name, index) => ({ name, generation: String(100 + index) })));

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
  root = exampleRepo("brand-check-");
  ENV.CLOUDSDK_CONFIG = root;
  writeFileSync(join(root, "application_default_credentials.json"), "{}");
  writeChapter(root);
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ engines: { node: ">=24.15.0" }, packageManager: "pnpm@11.5.1" }),
  );
  applyProfile({
    profile: loadProfile({ repoRoot: root, profile: CHAPTER }),
    repoRoot: root,
    env: {},
  });
  calls = [];
  responses = new Map<string, string | Error>([
    ["gcloud auth list", "owner@example.org\n"],
    [
      "gcloud storage objects list",
      listingOf(["brand.toml", ...ASSET_CONTRACT.map(({ path }) => path)]),
    ],
    ["pnpm --version", "11.5.1\n"],
    ["java --version", "openjdk 21.0.5 2024-10-15 LTS\n"],
    ["firebase --version", "15.22.1\n"],
    ["gh --version", "gh version 2.103.0 (2026-10-21)\n"],
    ["gh auth status", "  ✓ Logged in to github.com account octo (keyring)\n"],
    ["git -C ", "https://github.com/acme/luminova.git\n"],
    ["gh repo view acme/luminova", "acme/luminova\n"],
    ["gh variable get FIREBASE_PROJECT_ID --repo acme/luminova", "jci-valle\n"],
    ["gh variable get GCP_PROJECT_NUMBER --repo acme/luminova", "123456789012\n"],
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
      "brand.toml": "ok",
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
      `brand/ selects "${CHAPTER}" (your chapter's brand in brand/local/)`,
    );
    expect(rowFor(rows, "profile").detail).toBe(`brand/${CHAPTER}/`);
    expect(rowFor(rows, "CD identity").detail).toBe(
      "FIREBASE_PROJECT_ID=jci-valle, GCP_PROJECT_NUMBER=123456789012: CD signs in as firebase-deployer@jci-valle.iam.gserviceaccount.com",
    );
    expect(rowFor(rows, "gcloud account").detail).toBe("owner@example.org");
    expect(rowFor(rows, "bucket").detail).toMatch(`all 17 files in gs://${BUCKET}`);
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
        `gcloud storage objects list gs://${BUCKET}/** --format=json`,
        "gh --version",
        "gh auth status --active",
        "gh variable get FIREBASE_PROJECT_ID --repo acme/luminova",
        "gh variable get GCP_PROJECT_NUMBER --repo acme/luminova",
        `git -C ${root} remote get-url origin`,
        "gh repo view acme/luminova --json nameWithOwner -q .nameWithOwner",
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
    expect(rows).toHaveLength(17);
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
    responses.set("gcloud storage objects list", listingOf(["logo-main.png"]));
    const row = rowFor(await diagnose(), "bucket");
    expect(row.status).toBe("fail");
    expect(row.detail).toMatch(/16 of 17 files missing/);
  });

  it("fails a stale .firebaserc with the command that fixes it", async () => {
    writeFileSync(join(root, ".firebaserc"), "{}");
    expect(rowFor(await diagnose(), ".firebaserc")).toMatchObject({
      status: "fail",
      detail: `not generated from "${CHAPTER}"`,
    });
  });

  it("names each image with a problem in the images section, and the folder in its title", async () => {
    rmSync(join(root, "brand", CHAPTER, "og-image.png"));
    const images = (await sectionsOf())[2];
    expect(images?.title).toBe("Images in brand/local/");
    expect(images?.rows.map(({ check: name, status }) => `${name} ${status}`)).toEqual([
      "og-image.png fail",
      "images ok",
    ]);
  });

  it("warns, without failing, about values the chapter still takes from the example", async () => {
    writeChapter(root, { brand: { foundedYear: undefined, contact: undefined } });
    const rows = await diagnose();
    expect(rowFor(rows, "example values")).toMatchObject({
      status: "warn",
      detail: "foundedYear, [contact] email and [contact] mapUrl are still the example's",
      remedies: [{ change: expect.stringMatching(/^set them in brand\/local\/brand\.toml/) }],
    });
    expect(rows.filter(({ status }) => status === "fail")).toEqual([]);
  });

  it("warns, without failing, when brand.toml lacks the #:schema line editors read", async () => {
    const file = join(root, "brand", CHAPTER, "brand.toml");
    writeFileSync(file, readFileSync(file, "utf8").replace(/^#:schema .*\n/, ""));
    expect(rowFor(await diagnose(), "brand.toml")).toMatchObject({
      status: "warn",
      detail: expect.stringMatching(
        /valid, but line 1 is not "#:schema \.\.\/brand\.schema\.json"/,
      ),
      remedies: [
        { change: expect.stringMatching(/add "#:schema \.\.\/brand\.schema\.json" as line 1/) },
      ],
    });
  });

  it("selects the example, not a chapter folder committed in brand/, while brand/local/ holds none", async () => {
    rmSync(join(root, "brand", CHAPTER), { recursive: true });
    writeChapter(root, { slug: TEST_CHAPTER, assets: false });
    writeChapter(root, { slug: "jci-andina", assets: false });
    const rows = await diagnose();
    expect(rowFor(rows, "selection")).toMatchObject({
      status: "ok",
      detail: expect.stringMatching(/^brand\/ selects "example" \(the example/),
    });
    expect(rowFor(rows, "profile").detail).toBe("brand/example/");
  });

  it("warns when a BRAND_PROFILE override in the shell differs from brand/", async () => {
    const rows = await diagnose({ env: { BRAND_PROFILE: EXAMPLE_PROFILE } });
    expect(rowFor(rows, "selection")).toMatchObject({
      status: "warn",
      detail: `brand/ selects "${CHAPTER}" (your chapter's brand in brand/local/), but BRAND_PROFILE=example overrides it`,
      remedies: [expect.objectContaining({ run: "unset BRAND_PROFILE" })],
    });
    expect(rowFor(rows, "profile").detail).toBe("brand/example/ (from BRAND_PROFILE)");
  });

  it("passes the selection with brand/local/ beside a chapter folder committed in brand/", async () => {
    writeChapter(root, { slug: "jci-andina", assets: false, brand: { name: "JCI Andina" } });
    expect(rowFor(await diagnose(), "selection")).toMatchObject({
      status: "ok",
      detail: `brand/ selects "${CHAPTER}" (your chapter's brand in brand/local/)`,
    });
  });

  it("warns that a leftover luminova.json is no longer read", async () => {
    writeFileSync(join(root, "luminova.json"), JSON.stringify({ profile: EXAMPLE_PROFILE }));
    const rows = await diagnose();
    expect(rowFor(rows, "selection")).toMatchObject({
      status: "warn",
      detail: expect.stringMatching(/, but luminova\.json is no longer read$/),
      remedies: [expect.objectContaining({ run: "git rm luminova.json" })],
    });
    expect(rowFor(rows, "profile").detail).toBe(`brand/${CHAPTER}/`);
  });

  it("warns, without failing, when a repository variable is not set", async () => {
    responses.set(
      "gh variable get GCP_PROJECT_NUMBER --repo acme/luminova",
      commandFailure("gh", ["variable", "get", "GCP_PROJECT_NUMBER"], {
        stderr: "variable GCP_PROJECT_NUMBER was not found",
      }),
    );
    expect(rowFor(await diagnose(), "CD identity")).toMatchObject({
      status: "warn",
      detail:
        "repository variable GCP_PROJECT_NUMBER is not set, so CD deploys nothing yet (step 2 of pnpm brand:provision)",
      remedies: [expect.objectContaining({ run: "pnpm brand:provision" })],
    });
  });

  it("warns, without failing, when gh cannot read the variables (missing, not signed in)", async () => {
    for (const stderr of ["", "To get started with GitHub CLI, please run:  gh auth login"]) {
      const failure = commandFailure("gh", ["variable", "get", "FIREBASE_PROJECT_ID"], {
        code: stderr ? 4 : "ENOENT",
        stderr,
      });
      responses.set("gh variable get FIREBASE_PROJECT_ID --repo acme/luminova", failure);
      const row = rowFor(await diagnose(), "CD identity");
      expect(row.status).toBe("warn");
      expect(row.detail).toMatch(/^could not read the repository variables: gh variable get/);
      expect(row.remedies).toEqual(failure.remedies);
    }
  });

  it("reads the variables of the fork origin names, never gh's default repository", async () => {
    const { cdReady, repo } = await check({ ...TOOLS, repoRoot: root, run, env: ENV });
    expect({ cdReady, repo }).toEqual({ cdReady: true, repo: "acme/luminova" });
    const variableReads = calls.filter(
      ([command, verb]) => command === "gh" && verb === "variable",
    );
    expect(variableReads.every((call) => call.join(" ").endsWith("--repo acme/luminova"))).toBe(
      true,
    );
    expect(variableReads).toHaveLength(2);
  });

  it("warns, reading no variables, when origin is upstream or not a github.com repository", async () => {
    for (const [origin, detail] of [
      [
        "git@github.com:JCIOriente/luminova.git\n",
        /^the git remote origin is JCIOriente\/luminova, upstream, not your fork/,
      ],
      [
        "https://gitlab.com/acme/luminova.git\n",
        /^could not read your fork from the git remote origin/,
      ],
    ] as const) {
      calls = [];
      responses.set("git -C ", origin);
      const { sections, cdReady } = await check({ ...TOOLS, repoRoot: root, run, env: ENV });
      const row = rowFor(
        sections.flatMap(({ rows }) => rows),
        "CD identity",
      );
      expect(row.status).toBe("warn");
      expect(row.detail).toMatch(detail);
      expect(cdReady).toBe(false);
      expect(calls.some(([command, verb]) => command === "gh" && verb === "variable")).toBe(false);
    }
  });

  it("reads the variables under GitHub's spelling of the fork, not origin's letter case", async () => {
    responses.set("git -C ", "https://github.com/ACME/Luminova.git\n");
    responses.set("gh repo view ACME/Luminova", "acme/luminova\n");
    const { repo, cdReady } = await check({ ...TOOLS, repoRoot: root, run, env: ENV });
    expect({ repo, cdReady }).toEqual({ repo: "acme/luminova", cdReady: true });
  });

  it("notes on the CD identity row when gh could not confirm the fork's letter case", async () => {
    responses.set("git -C ", "https://github.com/ACME/Luminova.git\n");
    responses.set("gh repo view", new CommandError("gh repo view failed: spawn gh ENOENT"));
    responses.set("gh variable get FIREBASE_PROJECT_ID --repo ACME/Luminova", "jci-valle\n");
    responses.set("gh variable get GCP_PROJECT_NUMBER --repo ACME/Luminova", "123456789012\n");
    const row = rowFor(await diagnose(), "CD identity");
    expect(row.detail).toBe(
      "FIREBASE_PROJECT_ID=jci-valle, GCP_PROJECT_NUMBER=123456789012: CD signs in as firebase-deployer@jci-valle.iam.gserviceaccount.com. Note: could not confirm the letter case of ACME/Luminova with gh (gh repo view ACME/Luminova); CD's keyless sign-in matches owner/name case-sensitively, so write it as GitHub does",
    );
  });

  it("is not CD-ready while the CD identity row only warns", async () => {
    responses.set(
      "gh variable get GCP_PROJECT_NUMBER --repo acme/luminova",
      commandFailure("gh", ["variable", "get", "GCP_PROJECT_NUMBER"], {
        stderr: "variable GCP_PROJECT_NUMBER was not found",
      }),
    );
    expect((await check({ ...TOOLS, repoRoot: root, run, env: ENV })).cdReady).toBe(false);
  });

  it("fails when the variables name another project than brand.toml", async () => {
    responses.set("gh variable get FIREBASE_PROJECT_ID --repo acme/luminova", "jci-other\n");
    expect(rowFor(await diagnose(), "CD identity")).toMatchObject({
      status: "fail",
      detail:
        'repository variable FIREBASE_PROJECT_ID is "jci-other", but brand.toml names "jci-valle": CD would refuse to deploy this brand',
      remedies: [
        expect.objectContaining({
          run: "gh variable set FIREBASE_PROJECT_ID --body jci-valle --repo acme/luminova",
        }),
      ],
    });
  });

  it("fails on a project number that is no number, and warns on another project's", async () => {
    responses.set("gh variable get GCP_PROJECT_NUMBER --repo acme/luminova", "jci-valle\n");
    expect(rowFor(await diagnose(), "CD identity")).toMatchObject({
      status: "fail",
      detail: 'repository variable GCP_PROJECT_NUMBER is "jci-valle", not a project number',
    });
    responses.set("gh variable get GCP_PROJECT_NUMBER --repo acme/luminova", "42\n");
    expect(rowFor(await diagnose(), "CD identity")).toMatchObject({
      status: "warn",
      detail:
        'repository variable GCP_PROJECT_NUMBER is "42", but the web apps of brand.toml belong to project number 123456789012',
    });
  });

  it("skips the profile-dependent rows when the profile is missing, without throwing", async () => {
    const rows = await diagnose({ env: { BRAND_PROFILE: "nope" } });
    expect(statusOf(rows)).toMatchObject({
      profile: "fail",
      "brand.toml": "skip",
      images: "skip",
      ".firebaserc": "skip",
      bucket: "skip",
      "gcloud account": "ok",
      "CD identity": "skip",
    });
    expect(calls.some((call) => call.includes("objects"))).toBe(false);
  });

  it("reports unreadable files as failing rows instead of throwing", async () => {
    rmSync(join(root, "brand", CHAPTER, "brand.toml"));
    mkdirSync(join(root, "brand", CHAPTER, "brand.toml"));
    rmSync(join(root, ".firebaserc"));
    mkdirSync(join(root, ".firebaserc"));
    const rows = await diagnose();
    expect(statusOf(rows)).toMatchObject({
      profile: "ok",
      "brand.toml": "fail",
      ".firebaserc": "skip",
    });
    expect(rowFor(rows, "brand.toml").detail).toMatch(/cannot read/);
  });

  it("fails an unreadable .firebaserc as its own row", async () => {
    rmSync(join(root, ".firebaserc"));
    mkdirSync(join(root, ".firebaserc"));
    const rows = await diagnose();
    expect(rowFor(rows, ".firebaserc")).toMatchObject({
      status: "fail",
      detail: expect.stringMatching(/EISDIR/),
    });
    expect(rows).toHaveLength(17);
  });

  it("fails the brand.toml row with every schema error, the site texts' included", async () => {
    writeFileSync(
      join(root, "brand", CHAPTER, "brand.toml"),
      'name = "JCI Valle"\n[contact]\nemail = "nope"\n',
    );
    const rows = await diagnose();
    expect(statusOf(rows)).toMatchObject({ profile: "ok", "brand.toml": "fail", images: "skip" });
    expect(rowFor(rows, "brand.toml").detail).toMatch(/brand\.toml city: required/);
    expect(rowFor(rows, "brand.toml").detail).toMatch(/\[contact\] email: not an email address/);
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
      responses.set("gcloud storage objects list", listingOf(["logo-main.png"]));
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
      const fixes = rowRemedies(await diagnose({ env: { BRAND_PROFILE: EXAMPLE_PROFILE } })).map(
        ({ change, run }) => run ?? change,
      );
      expect(fixes).toEqual([
        "corepack enable && corepack install",
        "unset BRAND_PROFILE",
        "pnpm brand:apply",
      ]);
    });

    it("sends a connected profile without CD's variables to brand:provision, not to a deploy", () => {
      const connected = loadProfile({ repoRoot: root, profile: CHAPTER });
      expect(checkNext(connected, { cdReady: false, repo: null }).map(({ run }) => run)).toEqual([
        "pnpm brand:provision",
      ]);
    });

    it("after a passing run, offers going live as a choice: upload, then deploy", () => {
      const connected = loadProfile({ repoRoot: root, profile: CHAPTER });
      const ready = { cdReady: true, repo: "acme/luminova" };
      expect(checkNext(connected, ready).map(({ run }) => run)).toEqual([
        "pnpm brand:push",
        "gh workflow run deploy.yml -f surface=all --repo acme/luminova",
      ]);
      expect(checkNext(connected, ready)[0]?.change).toMatch(/^when you are ready to go live/);
      const local = loadProfile({ repoRoot: root, profile: EXAMPLE_PROFILE });
      expect(checkNext(local, ready).map(({ run }) => run)).toEqual([
        "pnpm dev",
        "pnpm brand:init",
      ]);
    });

    it("shows going live as one row for a local-only profile, without calling gcloud", async () => {
      // A chapter fresh from brand:init without a Firebase project: a demo- project.
      rmSync(join(root, "brand", CHAPTER), { recursive: true });
      cpSync(join(root, "brand/example"), join(root, "brand/local"), { recursive: true });
      const rows = await diagnose();
      expect(rowFor(rows, "profile").detail).toBe("brand/local/");
      expect(rows.at(-1)).toMatchObject({
        check: "going live",
        status: "skip",
        detail: expect.stringMatching(/local-only profile.*brand:init/),
      });
      expect(rows.map(({ check: name }) => name)).not.toContain("bucket");
      expect(calls.filter(([command]) => command === "gcloud" || command === "gh")).toEqual([]);
    });

    it("shows going live as one row for the example, without calling gcloud or gh", async () => {
      // A clone installed under CI: no brand/local/, so brand/ selects the example.
      rmSync(join(root, "brand", CHAPTER), { recursive: true });
      applyProfile({
        profile: loadProfile({ repoRoot: root, profile: EXAMPLE_PROFILE }),
        repoRoot: root,
        env: {},
      });
      const { sections, profile } = await check({ ...TOOLS, repoRoot: root, run, env: ENV });
      const rows = sections.flatMap(({ rows: sectionRows }) => sectionRows);
      expect(rowFor(rows, "selection").detail).toMatch(/selects "example" \(the example/);
      expect(sections.at(-1)?.rows).toEqual([
        expect.objectContaining({
          check: "going live",
          status: "skip",
          detail: expect.stringMatching(/the example.*brand:init/),
        }),
      ]);
      expect(rows.filter(({ status }) => status === "fail")).toEqual([]);
      expect(calls.filter(([command]) => command === "gcloud" || command === "gh")).toEqual([]);
      if (!profile) throw new Error("expected the example profile");
      expect(
        checkNext(profile, { cdReady: false, repo: null }).map(({ run: command }) => command),
      ).toEqual(["pnpm dev", "pnpm brand:init"]);
    });

    it("orders the sections and rows as the fixes must happen", async () => {
      const sections = await sectionsOf();
      expect(
        sections.map(({ title, rows }) => [title, rows.map(({ check: name }) => name)]),
      ).toEqual([
        [SECTION_TITLES.tools, ["node", "pnpm", "java", "firebase"]],
        [SECTION_TITLES.chapter, ["selection", "profile", "brand.toml", ".firebaserc"]],
        ["Images in brand/local/", ["images"]],
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
