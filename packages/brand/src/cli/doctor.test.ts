import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeAssetSet } from "../asset-set.ts";
import { ASSET_CONTRACT } from "../assets.ts";
import { REPO_ROOT, loadProfile } from "../load-profile.ts";
import { PULLED_ASSETS_DIR } from "../release.ts";
import { applyProfile } from "./apply.ts";
import { DOCTOR_NEXT, doctor, doctorRemedies, type DoctorRow } from "./doctor.ts";
import { CommandError, commandFailure, type CommandRunner } from "./gcloud.ts";

const BUCKET = "jci-oriente-brand-assets";
const ENV = { BRAND_PROFILE: "jci-oriente" };

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
  doctor({ repoRoot: root, env: ENV, run, nodeVersion: "24.15.0", ...options });

describe("doctor", () => {
  it("reports every row, all passing, on a ready checkout", async () => {
    const rows = await diagnose();
    expect(statusOf(rows)).toEqual({
      profile: "ok",
      schema: "ok",
      "site content": "ok",
      assets: "ok",
      ".firebaserc": "ok",
      "gcloud account": "ok",
      bucket: "ok",
      BRAND_PROFILE: "ok",
      node: "ok",
      pnpm: "ok",
    });
    expect(rowFor(rows, "profile").detail).toBe("jci-oriente (from BRAND_PROFILE)");
    expect(rowFor(rows, "gcloud account").detail).toBe("owner@example.org");
    expect(rowFor(rows, "bucket").detail).toMatch(`16/16 contract files in gs://${BUCKET}`);
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
    expect(rows).toHaveLength(10);
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

  it("names the contract files missing from the bucket", async () => {
    responses.set("gcloud storage objects list", "logo-main.png\n");
    const row = rowFor(await diagnose(), "bucket");
    expect(row.status).toBe("fail");
    expect(row.detail).toMatch(/15 of 16 contract files missing/);
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
    expect(rowFor(await diagnose(), "assets")).toMatchObject({
      status: "fail",
      detail: "1 problem",
      remedies: [{ change: "see which files and what to do", run: "pnpm brand:check" }],
    });
  });

  it("fails BRAND_PROFILE when unset, while the default profile still reports", async () => {
    const rows = await diagnose({ env: {} });
    expect(statusOf(rows)).toMatchObject({ BRAND_PROFILE: "fail", profile: "ok", schema: "ok" });
    expect(rowFor(rows, "profile").detail).toBe("jci-oriente (default)");
    const unset = rowFor(await diagnose({ env: { SHELL: "/bin/zsh" } }), "BRAND_PROFILE");
    expect(unset.detail).toBe("unset (profiles: jci-oriente)");
    expect(unset.remedies?.[0]?.change).toMatch(/\.envrc/);
  });

  it("skips the profile-dependent rows when the profile is missing, without throwing", async () => {
    const rows = await diagnose({ env: { BRAND_PROFILE: "nope" } });
    expect(statusOf(rows)).toMatchObject({
      profile: "fail",
      schema: "skip",
      assets: "skip",
      ".firebaserc": "skip",
      bucket: "skip",
      "gcloud account": "ok",
      BRAND_PROFILE: "ok",
    });
    expect(calls.some((call) => call.includes("objects"))).toBe(false);
  });

  it("reports unreadable files as failing rows instead of throwing", async () => {
    rmSync(join(root, "brand/jci-oriente/brand.json"));
    mkdirSync(join(root, "brand/jci-oriente/brand.json"));
    rmSync(join(root, ".firebaserc"));
    mkdirSync(join(root, ".firebaserc"));
    const rows = await diagnose();
    expect(statusOf(rows)).toMatchObject({ profile: "ok", schema: "fail", ".firebaserc": "skip" });
    expect(rowFor(rows, "schema").detail).toMatch(/cannot read/);
  });

  it("fails an unreadable .firebaserc as its own row", async () => {
    rmSync(join(root, ".firebaserc"));
    mkdirSync(join(root, ".firebaserc"));
    const rows = await diagnose();
    expect(rowFor(rows, ".firebaserc")).toMatchObject({
      status: "fail",
      detail: expect.stringMatching(/EISDIR/),
    });
    expect(rows).toHaveLength(10);
  });

  it("fails the schema row with the schema errors", async () => {
    writeFileSync(
      join(root, "brand/jci-oriente/brand.json"),
      JSON.stringify({ slug: "jci-oriente" }),
    );
    const rows = await diagnose();
    expect(statusOf(rows)).toMatchObject({ profile: "ok", schema: "fail", assets: "skip" });
    expect(rowFor(rows, "schema").detail).toMatch(/name/);
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
      const rows = await diagnose({ env: { SHELL: "/bin/zsh" }, nodeVersion: "24.10.0" });
      expect(runsOf(rowFor(rows, ".firebaserc"))).toEqual(["pnpm brand:apply"]);
      expect(runsOf(rowFor(rows, "gcloud account"))).toEqual(["gcloud auth login"]);
      expect(runsOf(rowFor(rows, "bucket"))).toEqual(["pnpm brand:push"]);
      expect(runsOf(rowFor(rows, "node"))).toEqual(["nvm install && nvm use"]);
      expect(runsOf(rowFor(rows, "BRAND_PROFILE"))).toEqual([
        "echo 'export BRAND_PROFILE=jci-oriente' >> ~/.zshrc",
        "export BRAND_PROFILE=jci-oriente",
        "gh variable set BRAND_PROFILE --env production --body jci-oriente",
      ]);
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

    it("lists the fixes once, BRAND_PROFILE before the cloud steps that need it", async () => {
      responses.set(
        "gcloud storage objects list",
        commandFailure("gcloud", ["storage", "objects", "list"], {
          stderr: "gs://x not found: 404.",
        }),
      );
      responses.set("pnpm --version", "11.4.0\n");
      const runs = doctorRemedies(await diagnose({ env: { SHELL: "/bin/zsh" } })).map(
        ({ run }) => run,
      );
      expect(runs).toEqual([
        "corepack enable && corepack install",
        "echo 'export BRAND_PROFILE=jci-oriente' >> ~/.zshrc",
        "export BRAND_PROFILE=jci-oriente",
        "gh variable set BRAND_PROFILE --env production --body jci-oriente",
        "pnpm brand:provision",
        "pnpm brand:provision --apply",
      ]);
    });

    it("points a passing setup at the full deploy", () => {
      expect(DOCTOR_NEXT.map(({ run }) => run)).toEqual([
        "gh workflow run deploy.yml -f surface=all",
      ]);
    });

    it("orders the rows as the fixes must happen", async () => {
      expect((await diagnose()).map(({ check }) => check)).toEqual([
        "node",
        "pnpm",
        "BRAND_PROFILE",
        "profile",
        "schema",
        "site content",
        "assets",
        ".firebaserc",
        "gcloud account",
        "bucket",
      ]);
    });
  });
});
