import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CommandError, type CommandRunner } from "./gcloud.ts";
import { INSTALL_NVM, installRemedy, type Tool } from "./install.ts";
import { fail, ok, skip, warn, type CheckRow } from "./rows.ts";

/**
 * The tools each part of docs/adopting.md needs, checked read-only (spec
 * docs/specs/2026-10-25-brand-setup.md). Imports no npm package, so `brand:setup` runs
 * before `pnpm install` (S4).
 */
export type Part = "try" | "live";

export const PART_TITLES: Readonly<Record<Part, string>> = {
  try: "Part 1: try it on your computer",
  live: "Part 2: go live",
};

export interface ToolRow extends CheckRow {
  part: Part;
}

interface Context {
  repoRoot: string;
  run: CommandRunner;
  platform: NodeJS.Platform;
  env: Readonly<Record<string, string | undefined>>;
  home: string;
  exists: (path: string) => boolean;
  nodeVersion: string;
}

interface ToolCheck {
  check: string;
  part: Part;
  /** Only an optional step needs it: it warns, and brand:doctor leaves it out (S3, S5). */
  optional?: true;
  probe: (context: Context) => Promise<CheckRow>;
}

/** firebase-tools' MIN_SUPPORTED_JAVA_MAJOR_VERSION. */
const MIN_JAVA = 21;
const CI_FIREBASE_CLI = "15.22.1";
/** Homebrew's keg-only `openjdk`; tools/scripts/emulators.sh puts it on PATH (S8). */
const HOMEBREW_JAVA = "/opt/homebrew/opt/openjdk/bin/java";
const ADC_FILE = "application_default_credentials.json";

const SIGN_IN_GCLOUD = { run: "gcloud auth login", where: "shell" } as const;

const firstLine = (output: string) => output.trim().split("\n")[0] ?? "";

const isNotInstalled = (error: unknown) =>
  error instanceof CommandError && error.kind === "notInstalled";

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

function readRootManifest(repoRoot: string): { engines?: string; packageManager?: string } {
  const manifest: unknown = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  return {
    engines: text(field(field(manifest, "engines"), "node")),
    packageManager: text(field(manifest, "packageManager")),
  };
}

/** A CLI's `--version`: the version, or this OS's install command when it is missing. */
function versionCheck(tool: Tool, part: Part, parse: (output: string) => string): ToolCheck {
  return {
    check: tool,
    part,
    probe: async ({ run, platform }) => {
      try {
        return ok(tool, parse(await run(tool, ["--version"])));
      } catch (error) {
        if (isNotInstalled(error))
          return fail(tool, "not installed", [installRemedy(tool, platform)]);
        throw error;
      }
    },
  };
}

/** A sign-in check; a missing CLI is its own row's failure, so this one skips. */
function signInCheck(
  check: string,
  part: Part,
  tool: Tool,
  probe: (context: Context) => Promise<CheckRow>,
  optional?: true,
): ToolCheck {
  return {
    check,
    part,
    optional,
    probe: async (context) => {
      try {
        return await probe(context);
      } catch (error) {
        if (isNotInstalled(error)) return skip(check, `needs ${tool}`);
        throw error;
      }
    },
  };
}

const CHECKS: readonly ToolCheck[] = [
  {
    check: "node",
    part: "try",
    probe: async ({ repoRoot, nodeVersion }) => {
      const { engines } = readRootManifest(repoRoot);
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
    probe: async ({ repoRoot, run, platform }) => {
      let version: string;
      try {
        version = (await run("pnpm", ["--version"])).trim();
      } catch (error) {
        if (isNotInstalled(error))
          return fail("pnpm", "not installed", [installRemedy("pnpm", platform)]);
        throw error;
      }
      const pinned = readRootManifest(repoRoot).packageManager?.replace(/^pnpm@/, "");
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
    probe: async ({ run, platform, exists }) => {
      const install = [installRemedy("java", platform)];
      let output: string;
      try {
        output = await run("java", ["--version"]);
      } catch (error) {
        if (!(error instanceof CommandError)) throw error;
        if (error.kind !== "notInstalled") return fail("java", firstLine(error.message), install);
        return platform === "darwin" && exists(HOMEBREW_JAVA)
          ? ok("java", "Homebrew OpenJDK, not on PATH (pnpm dev adds it)")
          : fail("java", "not installed", install);
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
  signInCheck("gh account", "live", "gh", async ({ run }) => {
    try {
      const status = await run("gh", ["auth", "status", "--active"]);
      return ok("gh account", /account (\S+)/.exec(status)?.[1] ?? "signed in");
    } catch (error) {
      if (!(error instanceof CommandError) || error.kind !== "signIn") throw error;
      return fail("gh account", "not signed in", error.remedies);
    }
  }),
  versionCheck(
    "gcloud",
    "live",
    (output) => /Google Cloud SDK (\S+)/.exec(output)?.[1] ?? firstLine(output),
  ),
  signInCheck("gcloud account", "live", "gcloud", async ({ run }) => {
    const account = firstLine(
      await run("gcloud", ["auth", "list", "--filter=status:ACTIVE", "--format=value(account)"]),
    );
    return account
      ? ok("gcloud account", account)
      : fail("gcloud account", "nobody signed in", [SIGN_IN_GCLOUD]);
  }),
  {
    check: "gcloud ADC",
    part: "live",
    optional: true,
    // By file, so no token is minted (S9).
    probe: async ({ env, home, exists }) => {
      const file =
        env.GOOGLE_APPLICATION_CREDENTIALS ||
        join(env.CLOUDSDK_CONFIG || join(home, ".config", "gcloud"), ADC_FILE);
      return exists(file)
        ? ok("gcloud ADC", file.startsWith(home) ? `~${file.slice(home.length)}` : file)
        : warn("gcloud ADC", "none yet (step 13 needs it)", [
            {
              change: "sign in for scripts, before step 13",
              run: "gcloud auth application-default login",
              where: "shell",
            },
          ]);
    },
  },
  signInCheck(
    "firebase account",
    "live",
    "firebase",
    async ({ run }) => {
      const account = /Logged in as (\S+)/.exec(await run("firebase", ["login:list"]))?.[1];
      return account
        ? ok("firebase account", account)
        : warn("firebase account", "nobody signed in", [
            {
              change: "only brand:init --connect --sdkconfig needs it (step 7)",
              run: "firebase login",
              where: "shell",
            },
          ]);
    },
    true,
  ),
];

const WINDOWS: CheckRow = fail("windows", "native Windows cannot run the guide's commands", [
  {
    change:
      "install WSL 2 (PowerShell as administrator), restart, then clone and follow the Linux commands inside Ubuntu",
    run: "wsl --install",
    where: "shell",
  },
]);

/** The checks of a part, by name; `required` leaves out the optional ones. */
export const toolChecks = (part: Part, { required = false } = {}): string[] =>
  CHECKS.filter((tool) => tool.part === part && !(required && tool.optional)).map(
    ({ check }) => check,
  );

async function attempt(check: string, body: () => Promise<CheckRow>): Promise<CheckRow> {
  try {
    return await body();
  } catch (error) {
    // A table cell: stderr's first line is the reason, the rest is advice.
    if (error instanceof CommandError) return fail(check, firstLine(error.message), error.remedies);
    return fail(check, firstLine(error instanceof Error ? error.message : String(error)));
  }
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
  required = false,
}: {
  parts: readonly Part[];
  repoRoot: string;
  run: CommandRunner;
  platform?: NodeJS.Platform;
  env?: Readonly<Record<string, string | undefined>>;
  home?: string;
  exists?: (path: string) => boolean;
  nodeVersion?: string;
  /** brand:doctor: only what the next step cannot do without. */
  required?: boolean;
}): Promise<ToolRow[]> {
  if (platform === "win32") return [{ ...WINDOWS, part: parts[0] ?? "try" }];
  const context: Context = { repoRoot, run, platform, env, home, exists, nodeVersion };
  const checks = CHECKS.filter((tool) => parts.includes(tool.part) && !(required && tool.optional));
  // Independent commands: start them together, report in guide order.
  return Promise.all(
    checks.map(async ({ check, part, probe }) => ({
      ...(await attempt(check, () => probe(context))),
      part,
    })),
  );
}
