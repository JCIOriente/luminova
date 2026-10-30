// Whether a worktree's brand/local/ is only what `pnpm install` seeds, so `wt:clean` may
// delete it with the worktree. The seed rule itself is @luminova/brand's (node strips the types).
import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import {
  BUCKET_CONTRACT,
  PULL_MANIFEST_FILE,
  isUntouchedSeed,
  localDir,
} from "../../../packages/brand/src/local-folder.ts";

/** The ignored path `git status --ignored` names for it. */
export const BRAND_LOCAL = "brand/local/";

const SEEDED = new Set([...BUCKET_CONTRACT, PULL_MANIFEST_FILE]);

/** Every file is a seeded one, still the example's bytes: a reinstall brings it all back.
 *  Anything else in the folder (an edit, an icon master, a link) is the member's. */
export function isRebuildableBrandSeed(worktree) {
  const dir = localDir(worktree);
  if (!existsSync(dir) || !isUntouchedSeed(worktree)) return false;
  return readdirSync(dir, { recursive: true, withFileTypes: true }).every(
    (entry) =>
      entry.isDirectory() ||
      (entry.isFile() && SEEDED.has(relative(dir, join(entry.parentPath, entry.name)))),
  );
}
