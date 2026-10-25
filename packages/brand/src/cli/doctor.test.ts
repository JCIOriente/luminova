import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeAssetSet } from "../asset-set.ts";
import { ASSET_CONTRACT } from "../assets.ts";
import { REPO_ROOT, loadProfile } from "../load-profile.ts";
import { PULLED_ASSETS_DIR } from "../release.ts";
import { applyProfile } from "./apply.ts";
import { doctor, doctorNext, doctorRemedies, type DoctorRow } from "./doctor.ts";
import { CommandError, commandFailure, type CommandRunner } from "./gcloud.ts";

const BUCKET = "jci-oriente-brand-assets";
const ENV = {};

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

function statusOf(rows: DoctorRow[]): Record<string, DoctorRow["status"]> {
  return Object.fromEntries(rows.map(({ check, status }) => [check, status]));
}

function rowFor(rows: DoctorRow[], check: string): DoctorRow {
  const row = rows.find((candidate) => candidate.check === check);
  if (!row) throw new Error(`no row ${check}`);
  return row;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "brand-doctor-"));
  cpSync(join(REPO_ROOT, "brand"), join(root, "brand"), { recursive: true });
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ engines: { node: ">=24.15.0" }, packageManager: "pnpm@11.5.1" }),
  );
  writeAssetSet(join(root, PULLED_ASSETS_DIR));
  applyProfile({
    profile: loadProfile({ repoRoot: root, profile: "jci-oriente" }),
    repoRoot: root,
    env: {},
  });
  calls = [];
  responses = new Map<string, string | Error>([
    ["gcloud auth list", "owner@example.org\n"],
    ["gcloud storage objects list", `${ASSET_CONTRACT.map(({ path }) => path).join("\n")}\n`],
    ["pnpm --version", "11.5.1\n"],
  ]);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const diagnose = (options: { env?: Record<string, string>; nodeVersion?: string } = {}) =>
  doctor({ repoRoot: root, env: ENV, run, nodeVersion: "24.15.0", ...options }).then(
    ({ rows }) => rows,
  );

describe("doctor", () => {
  it("reports every row, all passing, on a ready checkout", async () => {
    const rows = await diagnose();
    expect(statusOf(rows)).toEqual({
      profile: "ok",
      "brand.json": "ok",
      "site content": "ok",
      images: "ok",
      ".firebaserc": "ok",
      "gcloud account": "ok",
      bucket: "ok",
      selection: "ok",
      "CD identity": "ok",
      node: "ok",
      pnpm: "ok",
    });
    expect(rowFor(rows, "selection").detail).toBe(
      'brand/ selects "jci-oriente" (the example: no chapter profile in brand/ yet)',
    );
    expect(rowFor(rows, "profile").detail).toBe("brand/jci-oriente/");
    expect(rowFor(rows, "CD identity").detail).toBe(
      "firebase-deployer@jci-oriente.iam.gserviceaccount.com",
    );
    expect(rowFor(rows, "gcloud account").detail).toBe("owner@example.org");
    expect(rowFor(rows, "bucket").detail).toMatch(`all 16 images in gs://${BUCKET}`);
  });

  it("only ever reads: the exact external commands it runs", async () => {
    await diagnose();
    expect(calls).toEqual([
      ["gcloud", "auth", "list", "--filter=status:ACTIVE", "--format=value(account)"],
      ["gcloud", "storage", "objects", "list", `gs://${BUCKET}/**`, "--format=value(name)"],
      ["pnpm", "--version"],
    ]);
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
    expect(rows).toHaveLength(11);
    expect(statusOf(rows)).toMatchObject({ "gcloud account": "fail", bucket: "fail", pnpm: "ok" });
    expect(rowFor(rows, "gcloud account").detail).toMatch(/ENOENT/);
  });

  it("fails the account row when nobody is signed in", async () => {
    responses.set("gcloud auth list", "");
    expect(rowFor(await diagnose(), "gcloud account")).toMatchObject({
      status: "fail",
      detail: "nobody signed in",
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
      detail: 'not generated from "jci-oriente"',
    });
  });

  it("fails asset problems with a pointer to brand:check", async () => {
    rmSync(join(root, PULLED_ASSETS_DIR, "og-image.png"));
    expect(rowFor(await diagnose(), "images")).toMatchObject({
      status: "fail",
      detail: "1 problem",
      remedies: [{ change: "see which files and what to do", run: "pnpm brand:check" }],
    });
  });

  it("fails two chapter profiles once, with both ways out, and skips the profile", async () => {
    for (const slug of ["jci-andina", "jci-valle"]) {
      cpSync(join(root, "brand/fixture"), join(root, "brand", slug), { recursive: true });
    }
    const rows = await diagnose();
    expect(statusOf(rows)).toMatchObject({ selection: "fail", profile: "skip", bucket: "skip" });
    expect(rowFor(rows, "selection").detail).toMatch(/brand\/ holds 2 chapter profiles/);
    expect(rowFor(rows, "selection").remedies?.[0]?.change).toMatch(/^delete the folder/);
  });

  it("only warns about two chapter profiles under --profile, which names one", async () => {
    for (const slug of ["jci-andina", "jci-valle"]) {
      cpSync(join(root, "brand/fixture"), join(root, "brand", slug), { recursive: true });
    }
    const { rows } = await doctor({
      repoRoot: root,
      env: ENV,
      run,
      nodeVersion: "24.15.0",
      profile: "jci-oriente",
    });
    expect(statusOf(rows)).toMatchObject({ selection: "warn", profile: "ok" });
  });

  it("warns when a BRAND_PROFILE override in the shell differs from brand/", async () => {
    const rows = await diagnose({ env: { BRAND_PROFILE: "fixture" } });
    expect(rowFor(rows, "selection")).toMatchObject({
      status: "warn",
      detail:
        'brand/ selects "jci-oriente" (the example: no chapter profile in brand/ yet), but BRAND_PROFILE=fixture overrides it',
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
    expect(rowFor(rows, "profile").detail).toBe("brand/jci-oriente/");
  });

  it("warns, without failing, when the profile has no CD identity", async () => {
    const file = join(root, "brand/jci-oriente/brand.json");
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
    rmSync(join(root, "brand/jci-oriente/brand.json"));
    mkdirSync(join(root, "brand/jci-oriente/brand.json"));
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
    expect(rows).toHaveLength(11);
  });

  it("fails the schema row with the schema errors", async () => {
    writeFileSync(
      join(root, "brand/jci-oriente/brand.json"),
      JSON.stringify({ slug: "jci-oriente" }),
    );
    const rows = await diagnose();
    expect(statusOf(rows)).toMatchObject({ profile: "ok", "brand.json": "fail", images: "skip" });
    expect(rowFor(rows, "brand.json").detail).toMatch(/name/);
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
    const runsOf = (row: DoctorRow) => (row.remedies ?? []).map(({ run }) => run);

    it("says how to fix each failing row", async () => {
      writeFileSync(join(root, ".firebaserc"), "{}");
      responses.set("gcloud auth list", "");
      responses.set("gcloud storage objects list", "logo-main.png\n");
      const rows = await diagnose({ nodeVersion: "24.10.0" });
      expect(runsOf(rowFor(rows, ".firebaserc"))).toEqual(["pnpm brand:apply"]);
      expect(runsOf(rowFor(rows, "gcloud account"))).toEqual(["gcloud auth login"]);
      expect(runsOf(rowFor(rows, "bucket"))).toEqual(["pnpm brand:push"]);
      expect(runsOf(rowFor(rows, "node"))).toEqual(["nvm install && nvm use"]);
    });

    it("sends a bucket that does not exist to brand:provision", async () => {
      responses.set(
        "gcloud storage objects list",
        commandFailure("gcloud", ["storage", "objects", "list"], {
          stderr: "gs://x not found: 404.",
        }),
      );
      expect(runsOf(rowFor(await diagnose(), "bucket"))).toEqual([
        "pnpm brand:provision",
        "pnpm brand:provision --apply",
      ]);
    });

    it("says how to install a missing CLI", async () => {
      responses.set(
        "gcloud auth list",
        commandFailure("gcloud", ["auth", "list"], { code: "ENOENT", stderr: "" }),
      );
      const row = rowFor(await diagnose(), "gcloud account");
      expect(row.remedies?.[0]?.change).toMatch(/install the Google Cloud CLI/);
    });

    it("lists the fixes once, in row order", async () => {
      responses.set(
        "gcloud storage objects list",
        commandFailure("gcloud", ["storage", "objects", "list"], {
          stderr: "gs://x not found: 404.",
        }),
      );
      responses.set("pnpm --version", "11.4.0\n");
      const runs = doctorRemedies(await diagnose({ env: { BRAND_PROFILE: "fixture" } })).map(
        ({ run }) => run,
      );
      expect(runs).toEqual([
        "corepack enable && corepack install",
        "unset BRAND_PROFILE",
        "pnpm brand:apply",
      ]);
    });

    it("after a passing run, offers going live as a choice", () => {
      const connected = loadProfile({ repoRoot: root, profile: "jci-oriente" });
      expect(doctorNext(connected).map(({ change, run }) => run ?? change)).toEqual([
        expect.stringMatching(
          /^when you are ready to go live: merge brand\/jci-oriente\/ to main in your fork/,
        ),
        "gh workflow run deploy.yml -f surface=all",
      ]);
      const local = loadProfile({ repoRoot: root, profile: "fixture" });
      expect(doctorNext(local).map(({ run }) => run)).toEqual([
        "pnpm dev",
        "pnpm brand:init --connect",
      ]);
    });

    it("skips the cloud rows of a local-only profile without calling gcloud", async () => {
      // A chapter fresh from brand:init --local: a demo- project, found in brand/.
      cpSync(join(root, "brand/fixture"), join(root, "brand/jci-valle"), { recursive: true });
      const file = join(root, "brand/jci-valle/brand.json");
      writeFileSync(
        file,
        JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), slug: "jci-valle" }),
      );
      const rows = await diagnose();
      expect(rowFor(rows, "profile").detail).toBe("brand/jci-valle/");
      expect(statusOf(rows)).toMatchObject({
        "CD identity": "skip",
        "gcloud account": "skip",
        bucket: "skip",
      });
      expect(rowFor(rows, "bucket").detail).toMatch(/local-only profile.*brand:init --connect/);
      expect(calls.filter(([command]) => command === "gcloud")).toEqual([]);
    });

    it("orders the rows as the fixes must happen", async () => {
      expect((await diagnose()).map(({ check }) => check)).toEqual([
        "node",
        "pnpm",
        "selection",
        "profile",
        "brand.json",
        "site content",
        "images",
        ".firebaserc",
        "CD identity",
        "gcloud account",
        "bucket",
      ]);
    });
  });
});
