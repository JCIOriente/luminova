import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, sep } from "node:path";
import { CommandError, SIGN_IN_REMEDY, type CommandRunner } from "./gcloud.ts";
import { CI_FIREBASE_CLI, INSTALL_NVM, installRemedy, type Tool } from "./install.ts";
import { fail, ok, skip, warn, type CheckRow } from "./rows.ts";

/**
 * The tools each part of docs/adopting.md needs, checked read-only for `brand:check` (spec
 * docs/specs/2026-10-25-brand-setup.md).
 */
export type Part = "try" | "live";

interface Manifest {
  engines?: string;
  packageManager?: string;
}

interface Context {
  run: CommandRunner;
  platform: NodeJS.Platform;
  env: Readonly<Record<string, string | undefined>>;
  home: string;
  exists: (path: string) => boolean;
  nodeVersion: string;
  /** The root package.json, read once for the node and pnpm rows. */
  manifest: () => Manifest;
}

interface ToolCheck {
  check: string;
  part: Part;
  /**
   * The CLI the probe runs. Missing, its own row fails with this OS's install command and
   * its sign-in rows skip; refusing a sign-in fails the row with the sign-in command.
   */
  tool?: Tool;
  /** Only an optional step needs it: it warns, never fails (S3). */
  optional?: true;
  probe: (context: Context) => Promise<CheckRow>;
}

/** firebase-tools' MIN_SUPPORTED_JAVA_MAJOR_VERSION. */
const MIN_JAVA = 21;
/** Homebrew's keg-only `openjdk`; tools/scripts/emulators.sh puts it on PATH (S8). */
const HOMEBREW_JAVA = "/opt/homebrew/opt/openjdk/bin/java";
const ADC_FILE = "application_default_credentials.json";

const firstLine = (output: string) => output.trim().split("\n")[0] ?? "";

/** `>=X.Y.Z` only, the form `engines.node` uses here. */
function meetsMinimum(version: string, range: string): boolean | null {
  const minimum = /^>=\s*(\d+)\.(\d+)\.(\d+)$/.exec(range.trim());
  const actual = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (!minimum || !actual) return null;
  for (let part = 1; part <= 3; part += 1) {
    const difference = Number(actual[part]) - Number(minimum[part]);
    if (difference !== 0) return difference > 0;
  }
  return true;
}

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null
    ? Object.getOwnPropertyDescriptor(value, key)?.value
    : undefined;

const text = (value: unknown) => (typeof value === "string" ? value : undefined);

function readRootManifest(repoRoot: string): Manifest {
  const manifest: unknown = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  return {
    engines: text(field(field(manifest, "engines"), "node")),
    packageManager: text(field(manifest, "packageManager")),
  };
}

/** A CLI's `--version`, parsed into the row. */
const versionCheck = (tool: Tool, part: Part, parse: (output: string) => string): ToolCheck => ({
  check: tool,
  part,
  tool,
  probe: async ({ run }) => ok(tool, parse(await run(tool, ["--version"]))),
});

const CHECKS: readonly ToolCheck[] = [
  {
    check: "node",
    part: "try",
    probe: async ({ manifest, nodeVersion }) => {
      const { engines } = manifest();
      const meets = engines ? meetsMinimum(nodeVersion, engines) : true;
      if (meets === null) return warn("node", `${nodeVersion} (cannot read engines "${engines}")`);
      return meets
        ? ok("node", nodeVersion)
        : fail("node", `${nodeVersion} (needs ${engines})`, [
            INSTALL_NVM,
            { change: "switch to the version in .nvmrc", run: "nvm install && nvm use" },
          ]);
    },
  },
  {
    check: "pnpm",
    part: "try",
    tool: "pnpm",
    probe: async ({ manifest, run }) => {
      const version = (await run("pnpm", ["--version"])).trim();
      const pinned = manifest().packageManager?.replace(/^pnpm@/, "");
      return !pinned || version === pinned
        ? ok("pnpm", version)
        : warn("pnpm", `${version} (packageManager pins ${pinned})`, [
            {
              change: "use the pnpm that package.json's packageManager pins",
              run: "corepack enable && corepack install",
            },
          ]);
    },
  },
  {
    check: "java",
    part: "try",
    tool: "java",
    probe: async ({ run, platform, exists }) => {
      // emulators.sh puts it first on PATH, so it is the Java pnpm dev runs.
      if (platform === "darwin" && exists(HOMEBREW_JAVA)) {
        return ok("java", "Homebrew OpenJDK (pnpm dev uses it)");
      }
      const install = [installRemedy("java", platform)];
      let output: string;
      try {
        output = await run("java", ["--version"]);
      } catch (error) {
        // A Java too old to know --version fails here too; either way, install 21.
        if (error instanceof CommandError && error.kind === "other") {
          return fail("java", firstLine(error.message), install);
        }
        throw error;
      }
      const version = /^\S+\s+(\d+(?:\.\d+)*)/.exec(firstLine(output))?.[1];
      if (!version) return warn("java", `cannot read "${firstLine(output)}"`);
      return Number(version.split(".")[0]) >= MIN_JAVA
        ? ok("java", version)
        : fail("java", `${version} (needs ${MIN_JAVA} or later)`, install);
    },
  },
  versionCheck("firebase", "try", (output) => {
    const version = firstLine(output);
    return version === CI_FIREBASE_CLI ? version : `${version} (CI uses ${CI_FIREBASE_CLI})`;
  }),
  versionCheck("gh", "live", (output) => /gh version (\S+)/.exec(output)?.[1] ?? firstLine(output)),
  {
    check: "gh account",
    part: "live",
    tool: "gh",
    probe: async ({ run }) => {
      // --active ignores other accounts' dead tokens; gh before 2.40 does not know it.
      const status = await run("gh", ["auth", "status", "--active"]).catch((error: unknown) => {
        if (error instanceof CommandError && /unknown flag: --active/.test(error.message)) {
          return run("gh", ["auth", "status"]);
        }
        throw error;
      });
      const account =
        /(?:account|as) (\S+)[^\n]*\n\s*- Active account: true/.exec(status)?.[1] ??
        /Logged in to \S+ (?:account|as) (\S+)/.exec(status)?.[1];
      return ok("gh account", account ?? "signed in");
    },
  },
  versionCheck(
    "gcloud",
    "live",
    (output) => /Google Cloud SDK (\S+)/.exec(output)?.[1] ?? firstLine(output),
  ),
  {
    check: "gcloud account",
    part: "live",
    tool: "gcloud",
    probe: async ({ run }) => {
      const account = firstLine(
        await run("gcloud", ["auth", "list", "--filter=status:ACTIVE", "--format=value(account)"]),
      );
      return account
        ? ok("gcloud account", account)
        : fail("gcloud account", "not signed in", [SIGN_IN_REMEDY.gcloud]);
    },
  },
  {
    check: "gcloud ADC",
    part: "live",
    optional: true,
    // By file, so no token is minted (S9).
    probe: async ({ env, home, exists }) => {
      const key = env.GOOGLE_APPLICATION_CREDENTIALS;
      // The variable wins over a new sign-in, so signing in again would not help.
      if (key && !exists(key)) {
        return warn("gcloud ADC", `${key} (GOOGLE_APPLICATION_CREDENTIALS) not found`, [
          {
            change: "fix the path, or unset it to use your gcloud sign-in",
            run: "unset GOOGLE_APPLICATION_CREDENTIALS",
            where: "shell",
          },
        ]);
      }
      const file = key || join(env.CLOUDSDK_CONFIG || join(home, ".config", "gcloud"), ADC_FILE);
      return exists(file)
        ? ok(
            "gcloud ADC",
            file.startsWith(home + sep) ? join("~", file.slice(home.length + 1)) : file,
          )
        : warn("gcloud ADC", "none yet (step 13 needs it)", [
            {
              change: "sign in for scripts (Application Default Credentials), before step 13",
              run: "gcloud auth application-default login",
              where: "shell",
            },
          ]);
    },
  },
  {
    check: "firebase account",
    part: "live",
    tool: "firebase",
    optional: true,
    probe: async ({ run }) => {
      const account = /Logged in as (\S+)/.exec(await run("firebase", ["login:list"]))?.[1];
      return account
        ? ok("firebase account", account)
        : warn("firebase account", "not signed in", [
            {
              change: "only reading the API keys in brand:init needs it (step 7)",
              ...SIGN_IN_REMEDY.firebase,
            },
          ]);
    },
  },
];

/**
 * Native Windows cannot run the guide (S7): the one row brand:check shows
 * there, before any check.
 */
export const nativeWindows = (
  platform: NodeJS.Platform = process.platform,
): CheckRow | undefined =>
  platform === "win32"
    ? fail("windows", "native Windows cannot run the guide's commands", [
        {
          change:
            "install WSL 2 from PowerShell as administrator, restart, then clone and follow the Linux commands inside Ubuntu",
          run: "wsl --install",
          where: "shell",
        },
      ])
    : undefined;

/** A probe's failure as its row; an optional check only warns (S3). */
function failedRow(toolCheck: ToolCheck, platform: NodeJS.Platform, error: unknown): CheckRow {
  const row = probeFailure(toolCheck, platform, error);
  return toolCheck.optional && row.status === "fail" ? { ...row, status: "warn" } : row;
}

function probeFailure(
  { check, tool }: ToolCheck,
  platform: NodeJS.Platform,
  error: unknown,
): CheckRow {
  if (!(error instanceof CommandError)) {
    return fail(check, firstLine(error instanceof Error ? error.message : String(error)));
  }
  if (error.kind === "notInstalled" && tool) {
    return check === tool
      ? fail(check, "not installed", [installRemedy(tool, platform)])
      : skip(check, `needs ${tool}`);
  }
  if (error.kind === "signIn") return fail(check, "not signed in", error.remedies);
  // A table cell: stderr's first line is the reason, the rest is advice.
  return fail(check, firstLine(error.message), error.remedies);
}

/** One row per check of the parts asked, in guide order; every row always reports. */
export async function toolRows({
  parts,
  repoRoot,
  run,
  platform = process.platform,
  env = process.env,
  home = homedir(),
  exists = existsSync,
  nodeVersion = process.versions.node,
}: {
  parts: readonly Part[];
  repoRoot: string;
  run: CommandRunner;
  platform?: NodeJS.Platform;
  env?: Readonly<Record<string, string | undefined>>;
  home?: string;
  exists?: (path: string) => boolean;
  nodeVersion?: string;
}): Promise<CheckRow[]> {
  let manifest: Manifest | undefined;
  const context: Context = {
    run,
    platform,
    env,
    home,
    exists,
    nodeVersion,
    manifest: () => (manifest ??= readRootManifest(repoRoot)),
  };
  // Independent commands: start them together, report in guide order.
  return Promise.all(
    CHECKS.filter((tool) => parts.includes(tool.part)).map(async (tool) => {
      try {
        return await tool.probe(context);
      } catch (error) {
        return failedRow(tool, platform, error);
      }
    }),
  );
}
