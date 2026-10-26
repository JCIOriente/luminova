import { parseArgs, type Args, type Flags } from "../argv.ts";
import { BrandConfigError, loadProfile, type LoadedProfile } from "../load-profile.ts";
import { formatRemedies } from "../remedy.ts";
import { CommandError } from "./gcloud.ts";

/**
 * Configuration and command failures print their message and exit 1; anything else is a
 * bug and keeps its stack.
 */
export async function exitOnFailure(body: () => Promise<void> | void): Promise<void> {
  try {
    await body();
  } catch (error) {
    if (!(error instanceof BrandConfigError || error instanceof CommandError)) throw error;
    console.error(error.message);
    // A BrandConfigError's message already ends with its "To fix:" block.
    if (error instanceof CommandError && error.remedies.length > 0) {
      console.error(formatRemedies(error.remedies));
    }
    process.exit(1);
  }
}

/**
 * Runs a brand command once its arguments are all ones it takes (`flags`); anything else
 * stops it with the list of what it takes. `body` reads the flags through `args`.
 */
export async function runBrandCommand(
  name: string,
  flags: Flags,
  body: (args: Args) => Promise<void> | void,
  argv: readonly string[] = process.argv.slice(2),
): Promise<void> {
  await exitOnFailure(async () => {
    const args = parseArgs(
      argv,
      flags,
      (problems, usage) =>
        new BrandConfigError(problems, [
          { change: usage ? `${name} takes ${usage}` : `${name} takes no options` },
        ]),
    );
    await body(args);
  });
}

/**
 * Runs a brand CLI against the profile brand/ selects, or `--profile <slug>`, which every
 * such command takes on top of its own `flags`.
 * A CLI that tooling runs (a firebase.json hook, a CD step) keeps stdout for data a caller
 * parses (`brand:ci-config`'s outputs) and writes status to stderr: firebase-tools copies
 * hook stdout into its `--json` output.
 */
export async function runCli(
  name: string,
  flags: Flags,
  body: (profile: LoadedProfile, args: Args) => Promise<void> | void,
): Promise<void> {
  const withProfile = { ...flags, values: { ...flags.values, "--profile": "slug" } };
  await runBrandCommand(name, withProfile, async (args) => {
    const profile = loadProfile({ profile: args.value("--profile") });
    for (const warning of profile.warnings) console.warn(`${name}: ${warning}`);
    await body(profile, args);
  });
}
