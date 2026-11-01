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

type Body = () => Promise<void> | void;
type ProfileBody = (profile: LoadedProfile) => Promise<void> | void;

/**
 * Runs a brand command, which takes no options (spec R27 C1): anything typed after it stops
 * it before it does anything. A bare `--` is pnpm's separator, not the user's.
 */
export async function runBrandCommand(
  name: string,
  body: Body,
  argv: readonly string[] = process.argv.slice(2),
): Promise<void> {
  await exitOnFailure(async () => {
    const extra = argv.filter((arg) => arg !== "--");
    if (extra.length > 0) {
      throw new CommandError(`${name} takes no options (got ${extra.join(" ")}).`, [
        { run: `pnpm ${name}` },
      ]);
    }
    await body();
  });
}

/**
 * Runs a brand CLI against the profile brand/ selects.
 * A CLI that tooling runs (a firebase.json hook, a CD step) keeps stdout for data a caller
 * parses (`brand:ci-config`'s outputs) and writes status to stderr: firebase-tools copies
 * hook stdout into its `--json` output.
 */
export async function runCli(name: string, body: ProfileBody): Promise<void> {
  await runBrandCommand(name, async () => {
    const profile = loadProfile({});
    for (const warning of profile.warnings) console.warn(`${name}: ${warning}`);
    await body(profile);
  });
}
