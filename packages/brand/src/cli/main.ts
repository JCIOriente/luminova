import { BrandConfigError, loadProfile, type LoadedProfile } from "../load-profile.ts";
import { CommandError } from "./gcloud.ts";

/**
 * Runs a brand CLI against the selected profile. Configuration and command failures
 * print their message and exit 1; anything else is a bug and keeps its stack.
 */
export async function runCli(
  name: string,
  body: (profile: LoadedProfile) => Promise<void> | void,
): Promise<void> {
  try {
    const profile = loadProfile();
    for (const warning of profile.warnings) console.warn(`${name}: ${warning}`);
    await body(profile);
  } catch (error) {
    if (!(error instanceof BrandConfigError || error instanceof CommandError)) throw error;
    console.error(error.message);
    process.exit(1);
  }
}
