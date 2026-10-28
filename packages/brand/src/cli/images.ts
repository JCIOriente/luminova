import {
  PULL_MANIFEST_FILE,
  assetRemedies,
  validateAssets,
  type AssetValidation,
} from "../assets.ts";
import type { Env, LoadedProfile } from "../load-profile.ts";
import { displayDir, selectAssetsDir } from "../release.ts";
import { fail, ok, warn, type CheckRow, type Section } from "./rows.ts";

export interface Images extends Section {
  /** The folder dev, `brand:check` and `brand:push` all read. */
  dir: string;
  validation: AssetValidation;
}

/**
 * The profile's images as one section: a row per image with a problem, then one for the
 * rest. Every command that reads images goes through here, so they agree on the folder.
 */
export function checkImages({
  profile,
  repoRoot,
  env,
}: {
  profile: LoadedProfile;
  repoRoot: string;
  env: Env;
}): Images {
  const dir = selectAssetsDir(repoRoot, profile, env, false);
  const label = displayDir(repoRoot, dir);
  const validation = validateAssets(dir, { profile: profile.slug });
  const remedies = assetRemedies(validation, label);
  const rows: CheckRow[] = [];
  let valid = 0;
  for (const { path, errors, warnings } of validation.files) {
    if (errors.length > 0) rows.push(fail(path, errors.join("; "), remedies));
    else if (warnings.length > 0) rows.push(warn(path, warnings.join("; "), remedies));
    else valid += 1;
  }
  if (validation.manifestError) {
    rows.push(fail(PULL_MANIFEST_FILE, validation.manifestError, remedies));
  }
  if (valid === validation.files.length) rows.push(ok("images", `all ${valid} valid`));
  else if (valid > 0) rows.push(ok("images", `${valid} more valid`));
  return { title: `Images in ${label}/`, rows, dir, validation };
}
