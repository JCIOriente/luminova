import { flagValue } from "../argv.ts";
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

/** Runs a brand CLI against the profile luminova.json selects, or `--profile <slug>`. */
export async function runCli(
  name: string,
  body: (profile: LoadedProfile) => Promise<void> | void,
): Promise<void> {
  await exitOnFailure(async () => {
    const profile = loadProfile({
      profile: flagValue(
        process.argv.slice(2),
        "--profile",
        (message) => new BrandConfigError([message]),
      ),
    });
    for (const warning of profile.warnings) console.warn(`${name}: ${warning}`);
    await body(profile);
  });
}
