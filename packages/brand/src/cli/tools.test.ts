import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CommandError, commandFailure, type CommandRunner } from "./gcloud.ts";
import { installRemedy } from "./install.ts";
import type { CheckRow } from "./rows.ts";
import { nativeWindows, toolChecks, toolRows, type Part } from "./tools.ts";

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

const notInstalled = (command: "java" | "gh" | "gcloud" | "firebase") =>
  commandFailure(command, ["--version"], { code: "ENOENT", stderr: "" });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "brand-tools-"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ engines: { node: ">=24.15.0" }, packageManager: "pnpm@11.5.1" }),
  );
  writeFileSync(join(root, "application_default_credentials.json"), "{}");
  calls = [];
  responses = new Map<string, string | Error>([
    ["pnpm --version", "11.5.1\n"],
    ["java --version", "openjdk 21.0.5 2024-10-15 LTS\nOpenJDK Runtime Environment\n"],
    ["firebase --version", "15.22.1\n"],
    ["firebase login:list", "Logged in as owner@example.org\n"],
    ["gh --version", "gh version 2.103.0 (2026-10-21)\nhttps://github.com/cli/cli/releases\n"],
    [
      "gh auth status",
      "github.com\n  ✓ Logged in to github.com account octo (keyring)\n  - Active account: true\n",
    ],
    ["gcloud --version", "Google Cloud SDK 586.0.0\nbq 2.1.0\n"],
    ["gcloud auth list", "owner@example.org\n"],
  ]);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const check = (
  options: {
    parts?: readonly Part[];
    platform?: NodeJS.Platform;
    env?: Record<string, string>;
    exists?: (path: string) => boolean;
    nodeVersion?: string;
    required?: boolean;
  } = {},
) =>
  toolRows({
    parts: ["try", "live"],
    repoRoot: root,
    run,
    platform: "linux",
    env: { CLOUDSDK_CONFIG: root },
    home: join(root, "home"),
    // This computer's own Homebrew Java must not count.
    exists: (path) => path.startsWith(root) && existsSync(path),
    nodeVersion: "24.15.0",
    ...options,
  });

const rowFor = (rows: readonly CheckRow[], name: string): CheckRow => {
  const row = rows.find(({ check: candidate }) => candidate === name);
  if (!row) throw new Error(`no row ${name}`);
  return row;
};

const summary = (rows: readonly CheckRow[]) =>
  rows.map(({ check: name, status, detail }) => `${name} ${status} ${detail}`);

describe("toolRows", () => {
  it("reports each tool's version and each sign-in, grouped by part", async () => {
    const rows = await check();
    expect(summary(rows)).toEqual([
      "node ok 24.15.0",
      "pnpm ok 11.5.1",
      "java ok 21.0.5",
      "firebase ok 15.22.1",
      "gh ok 2.103.0",
      "gh account ok octo",
      "gcloud ok 586.0.0",
      "gcloud account ok owner@example.org",
      `gcloud ADC ok ${join(root, "application_default_credentials.json")}`,
      "firebase account ok owner@example.org",
    ]);
    expect(rows.map(({ part }) => part)).toEqual([
      ...Array<Part>(4).fill("try"),
      ...Array<Part>(6).fill("live"),
    ]);
  });

  it("only ever reads: the exact commands it runs", async () => {
    await check();
    expect(calls.map((call) => call.join(" ")).sort()).toEqual(
      [
        "firebase --version",
        "firebase login:list",
        "gcloud --version",
        "gcloud auth list --filter=status:ACTIVE --format=value(account)",
        "gh --version",
        "gh auth status --active",
        "java --version",
        "pnpm --version",
      ].sort(),
    );
  });

  it("checks one part alone", async () => {
    const rows = await check({ parts: ["try"] });
    expect(rows.map(({ check: name }) => name)).toEqual(["node", "pnpm", "java", "firebase"]);
    expect(calls.every(([command]) => command !== "gh" && command !== "gcloud")).toBe(true);
  });

  it("leaves out the optional sign-ins when only the required checks are asked", async () => {
    const rows = await check({ parts: ["live"], required: true });
    expect(rows.map(({ check: name }) => name)).toEqual([
      "gh",
      "gh account",
      "gcloud",
      "gcloud account",
    ]);
    expect(toolChecks("live", { required: true })).toEqual([
      "gh",
      "gh account",
      "gcloud",
      "gcloud account",
    ]);
  });

  describe("on native Windows", () => {
    it("is one failing row that points at WSL 2; elsewhere there is none", () => {
      expect(nativeWindows("win32")).toMatchObject({
        check: "windows",
        status: "fail",
        remedies: [expect.objectContaining({ run: "wsl --install" })],
      });
      expect(nativeWindows("linux")).toBeUndefined();
      expect(nativeWindows("darwin")).toBeUndefined();
    });
  });

  describe("node and pnpm", () => {
    it("fails a Node older than engines.node, with nvm", async () => {
      const row = rowFor(await check({ nodeVersion: "24.10.0" }), "node");
      expect(row).toMatchObject({ status: "fail", detail: "24.10.0 (needs >=24.15.0)" });
      expect(row.remedies?.map(({ run: command }) => command)).toEqual([
        expect.stringMatching(/nvm-sh\/nvm\/v[\d.]+\/install\.sh \| bash$/),
        "nvm install && nvm use",
      ]);
    });

    it("warns, without failing, on a pnpm other than packageManager", async () => {
      responses.set("pnpm --version", "11.4.0\n");
      expect(rowFor(await check(), "pnpm")).toMatchObject({
        status: "warn",
        detail: "11.4.0 (packageManager pins 11.5.1)",
      });
    });
  });

  describe("java", () => {
    it("fails a missing Java with this OS's install command", async () => {
      responses.set("java --version", notInstalled("java"));
      expect(rowFor(await check(), "java")).toMatchObject({
        status: "fail",
        remedies: [expect.objectContaining({ run: "sudo apt install -y openjdk-21-jre-headless" })],
      });
      expect(rowFor(await check({ platform: "darwin" }), "java").remedies).toEqual([
        expect.objectContaining({ run: "brew install --cask temurin@21" }),
      ]);
    });

    it("accepts Homebrew's keg-only OpenJDK, which pnpm dev puts on PATH", async () => {
      responses.set(
        "java --version",
        commandFailure("java", ["--version"], {
          code: 1,
          stderr: "The operation couldn’t be completed. Unable to locate a Java Runtime.\n",
        }),
      );
      const rows = await check({
        platform: "darwin",
        exists: (path) => path === "/opt/homebrew/opt/openjdk/bin/java",
      });
      expect(rowFor(rows, "java")).toMatchObject({
        status: "ok",
        detail: "Homebrew OpenJDK, not on PATH (pnpm dev adds it)",
      });
    });

    it.each([
      ["openjdk 17.0.2 2022-01-18", "fail", "17.0.2 (needs 21 or later)"],
      ["openjdk 27 2026-09-15", "ok", "27"],
      ["java 21.0.2 2024-01-16 LTS", "ok", "21.0.2"],
    ] as const)("reads %s", async (output, status, detail) => {
      responses.set("java --version", `${output}\n`);
      expect(rowFor(await check(), "java")).toMatchObject({ status, detail });
    });

    it("fails a Java too old to know --version", async () => {
      responses.set(
        "java --version",
        commandFailure("java", ["--version"], { stderr: "Unrecognized option: --version" }),
      );
      expect(rowFor(await check(), "java")).toMatchObject({
        status: "fail",
        remedies: [expect.objectContaining({ change: "install Java 21" })],
      });
    });
  });

  describe("firebase", () => {
    it("notes a version other than CI's without failing", async () => {
      responses.set("firebase --version", "15.30.0\n");
      expect(rowFor(await check(), "firebase")).toMatchObject({
        status: "ok",
        detail: "15.30.0 (CI uses 15.22.1)",
      });
    });

    it("only warns when nobody is signed in: just --sdkconfig needs it", async () => {
      responses.set("firebase login:list", '⚠  No authorized accounts, run "firebase login"\n');
      expect(rowFor(await check(), "firebase account")).toMatchObject({
        status: "warn",
        detail: "not signed in",
        remedies: [expect.objectContaining({ run: "firebase login" })],
      });
    });
  });

  describe("sign-ins", () => {
    it("fails gh when nobody is signed in", async () => {
      responses.set(
        "gh auth status",
        commandFailure("gh", ["auth", "status"], {
          stderr: "You are not logged into any GitHub hosts. To log in, run: gh auth login",
        }),
      );
      expect(rowFor(await check(), "gh account")).toMatchObject({
        status: "fail",
        detail: "not signed in",
        remedies: [{ run: "gh auth login", where: "shell" }],
      });
    });

    it("fails gcloud when nobody is signed in", async () => {
      responses.set("gcloud auth list", "");
      expect(rowFor(await check(), "gcloud account")).toMatchObject({
        status: "fail",
        detail: "not signed in",
        remedies: [{ run: "gcloud auth login", where: "shell" }],
      });
    });

    it("skips a sign-in whose CLI is missing; the CLI's row says how to install it", async () => {
      for (const key of responses.keys()) {
        if (/^(gh|gcloud) /.test(key)) responses.delete(key);
      }
      responses.set("gh", notInstalled("gh"));
      responses.set("gcloud", notInstalled("gcloud"));
      const rows = await check({ platform: "darwin" });
      expect(rowFor(rows, "gh")).toMatchObject({
        status: "fail",
        detail: "not installed",
        remedies: [expect.objectContaining({ run: "brew install gh" })],
      });
      expect(rowFor(rows, "gcloud").remedies).toEqual([
        expect.objectContaining({ run: "brew install --cask gcloud-cli" }),
      ]);
      for (const name of ["gh account", "gcloud account"]) {
        expect(rowFor(rows, name).status).toBe("skip");
      }
    });

    it("finds ADC through GOOGLE_APPLICATION_CREDENTIALS first", async () => {
      const key = join(root, "key.json");
      writeFileSync(key, "{}");
      const rows = await check({ env: { GOOGLE_APPLICATION_CREDENTIALS: key } });
      expect(rowFor(rows, "gcloud ADC")).toMatchObject({ status: "ok", detail: key });
    });

    it("looks in ~/.config/gcloud without CLOUDSDK_CONFIG", async () => {
      const seen: string[] = [];
      await check({
        env: {},
        exists: (path) => {
          seen.push(path);
          return false;
        },
      });
      expect(seen).toContain(
        join(root, "home", ".config", "gcloud", "application_default_credentials.json"),
      );
    });

    it("only warns without ADC: step 13 needs it", async () => {
      rmSync(join(root, "application_default_credentials.json"));
      expect(rowFor(await check(), "gcloud ADC")).toMatchObject({
        status: "warn",
        detail: "none yet (step 13 needs it)",
        remedies: [expect.objectContaining({ run: "gcloud auth application-default login" })],
      });
    });
  });
});

describe("installRemedy", () => {
  it("gives Homebrew on macOS and Ubuntu's apt or the vendor page on Linux", () => {
    expect(installRemedy("gh", "darwin").run).toBe("brew install gh");
    expect(installRemedy("gh", "linux").change).toMatch(/install_linux\.md/);
    expect(installRemedy("gcloud", "freebsd")).toEqual(installRemedy("gcloud", "linux"));
  });
});
