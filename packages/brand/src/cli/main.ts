import { flagUsage, flagValue, unexpectedArguments, type Flags } from "../argv.ts";
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

/** A `--name <value>` flag of this command; a flag without a value is a config error. */
export const cliFlag = (name: string, argv: readonly string[] = process.argv.slice(2)) =>
  flagValue(argv, name, (message) => new BrandConfigError([message]));

/** Stops the command on anything in argv it does not take, listing what it does take. */
export function checkFlags(
  name: string,
  flags: Flags,
  argv: readonly string[] = process.argv.slice(2),
): void {
  const unexpected = unexpectedArguments(argv, flags);
  if (unexpected.length === 0) return;
  const usage = flagUsage(flags);
  throw new BrandConfigError(unexpected, [
    { change: usage ? `use only what ${name} takes: ${usage}` : `${name} takes no options` },
  ]);
}

/** Every command that loads a profile takes `--profile`. */
export const withProfile = (flags: Flags): Flags => ({
  ...flags,
  values: { ...flags.values, "--profile": "slug" },
});

/**
 * Runs a brand CLI against the profile brand/ selects, or `--profile <slug>`, once its
 * arguments are all ones it takes (`flags`, plus `--profile`).
 * A CLI that tooling runs (a firebase.json hook, a CD step) keeps stdout for data a caller
 * parses (`brand:ci-config`'s outputs) and writes status to stderr: firebase-tools copies
 * hook stdout into its `--json` output.
 */
export async function runCli(
  name: string,
  flags: Flags,
  body: (profile: LoadedProfile) => Promise<void> | void,
): Promise<void> {
  await exitOnFailure(async () => {
    checkFlags(name, withProfile(flags));
    const profile = loadProfile({ profile: cliFlag("--profile") });
    for (const warning of profile.warnings) console.warn(`${name}: ${warning}`);
    await body(profile);
  });
}
