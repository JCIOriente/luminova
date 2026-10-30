import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { BRAND_FILE, SCHEMA_LINE, valueAt } from "../brand-file.ts";
import { EXAMPLE_PROFILE, REPO_ROOT, loadProfile, readBase, type Env } from "../load-profile.ts";
import { fileSha256 } from "../hash.ts";
import {
  BUCKET_CONTRACT,
  IMAGE_PATHS,
  localDir,
  localLabel,
  recoverInterruptedCanary,
  writeManifest,
  type ObjectRecord,
} from "../local-folder.ts";
import { CHAPTER_IDENTITY } from "../schema.ts";
import { exitOnFailure } from "./main.ts";

/**
 * The seeded brand.toml: the schema line and the example's identity, so it layers on the
 * example like any chapter's file; brand:init replaces it with the chapter's own values.
 */
function seedBrandToml(repoRoot: string): string {
  const example = readBase(repoRoot);
  const line = (path: readonly string[]) =>
    `${path.at(-1)} = ${JSON.stringify(valueAt(example, path))}`;
  const top = CHAPTER_IDENTITY.filter((path) => path.length === 1);
  const colors = CHAPTER_IDENTITY.filter(([table]) => table === "colors");
  return [
    SCHEMA_LINE,
    `# Seeded from brand/${EXAMPLE_PROFILE}/ on install. pnpm brand:init writes your chapter's own`,
    `# values here; every key left out comes from brand/${EXAMPLE_PROFILE}/${BRAND_FILE}.`,
    ...top.map(line),
    "",
    "[colors]",
    ...colors.map(line),
    "",
  ].join("\n");
}

/**
 * Seeds a missing brand/local/ from the example (spec "Folders"): the minimal brand.toml,
 * copies of the 16 images, and a manifest that records them with source `example`. An
 * existing brand/local/, even an empty one, is never touched. Returns whether it seeded.
 */
export function seedLocal({
  repoRoot = REPO_ROOT,
  env = process.env,
}: { repoRoot?: string; env?: Env } = {}): boolean {
  // CI never seeds: CD's brand:pull refuses a brand/local/ of another project (the example's).
  if (env.CI?.trim()) return false;
  const recovered = recoverInterruptedCanary(repoRoot);
  if (recovered) console.error(`brand:seed: ${recovered}`);
  const dir = localDir(repoRoot);
  if (existsSync(dir)) return false;
  const exampleAssets = join(repoRoot, "brand", EXAMPLE_PROFILE, "assets");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, BRAND_FILE), seedBrandToml(repoRoot));
  for (const path of IMAGE_PATHS) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    copyFileSync(join(exampleAssets, path), join(dir, path));
  }
  const { brand } = loadProfile({ repoRoot, profile: EXAMPLE_PROFILE });
  const objects: Record<string, ObjectRecord> = {};
  for (const path of BUCKET_CONTRACT) {
    objects[path] = { source: "example", sha256: fileSha256(join(dir, path)) };
  }
  writeManifest(dir, {
    version: 1,
    project: brand.firebase.projectId,
    bucket: brand.assetsBucket,
    objects,
  });
  return true;
}

/** Where a brand lived before brand/local/; nothing reads it any more. */
const LEGACY_ASSETS_DIR = "brand-assets";

/** What install says about brand/ besides seeding, one line each. */
export function seedNotes(repoRoot: string = REPO_ROOT): string[] {
  const notes: string[] = [];
  if (existsSync(join(repoRoot, LEGACY_ASSETS_DIR))) {
    notes.push(
      `${LEGACY_ASSETS_DIR}/ is no longer read: copy your images into ${localLabel()}, then delete ${LEGACY_ASSETS_DIR}/.`,
    );
  }
  return notes;
}

if (import.meta.main) {
  await exitOnFailure(() => {
    if (seedLocal()) {
      console.error(
        `brand:seed: ${localLabel()} seeded from brand/${EXAMPLE_PROFILE}/; pnpm brand:init makes it your chapter's.`,
      );
    }
    for (const note of seedNotes()) console.error(`brand:seed: ${note}`);
  });
}
