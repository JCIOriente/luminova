import {
  copyFileSync,
  constants,
  existsSync,
  lstatSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { z } from "zod";
import { ASSET_CONTRACT } from "./assets.ts";
import { BRAND_FILE } from "./brand-file.ts";
import { BrandConfigError, errorMessage, issueLines } from "./errors.ts";
import { fileSha256 } from "./hash.ts";
import type { LoadedProfile } from "./load-profile.ts";
import type { Remedy } from "./remedy.ts";

/** The one local brand folder (spec D4): the chapter's brand.toml, its images, the manifest. */
export const LOCAL_PROFILE = "local";

/** In brand/local/: what brand:pull, brand:push or the seed last wrote there. */
export const PULL_MANIFEST_FILE = ".pull-manifest.json";

export const localDir = (repoRoot: string) => join(repoRoot, "brand", LOCAL_PROFILE);

/** `brand/local/<path>`, as messages name a file of the folder. */
export const localLabel = (path = "") => `brand/${LOCAL_PROFILE}/${path}`;

export const IMAGE_PATHS: readonly string[] = ASSET_CONTRACT.map(({ path }) => path);

/** The 17 paths the bucket and brand/local/ share: brand.toml, then the 16 images. */
export const BUCKET_CONTRACT: readonly string[] = [BRAND_FILE, ...IMAGE_PATHS];

/**
 * The paths a profile's bucket holds. TRANSITIONAL (the JCI Oriente removal PR drops this):
 * a committed chapter's brand.toml is in git, so its bucket holds only the images.
 */
export const bucketContract = ({ slug }: Pick<LoadedProfile, "slug">): readonly string[] =>
  slug === LOCAL_PROFILE ? BUCKET_CONTRACT : IMAGE_PATHS;

/** A generation number, as gcloud lists it and `--if-generation-match` takes it. */
export const generationSchema = z.string().regex(/^\d+$/, "expected a generation number");

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/, "expected a sha256");

const recordSchema = z.discriminatedUnion("source", [
  z.strictObject({
    source: z.literal("bucket"),
    generation: generationSchema,
    sha256: sha256Schema,
  }),
  z.strictObject({ source: z.literal("example"), sha256: sha256Schema }),
]);

const manifestSchema = z.strictObject({
  version: z.literal(1),
  project: z.string().min(1),
  bucket: z.string().min(1),
  objects: z.record(z.string(), recordSchema),
});

/** What brand/local/ last received: from the bucket (pull, push) or the example (the seed). */
export type ObjectRecord = z.infer<typeof recordSchema>;
export type PullManifest = z.infer<typeof manifestSchema>;

export const MANIFEST_LABEL = localLabel(PULL_MANIFEST_FILE);

const PULL_AGAIN: Remedy = {
  change: `delete ${MANIFEST_LABEL}, then download the brand again (needs gcloud auth login)`,
  run: "pnpm brand:pull",
};

/** The manifest of `dir`, or null when there is none. A malformed one stops the command. */
export function readManifest(dir: string): PullManifest | null {
  const file = join(dir, PULL_MANIFEST_FILE);
  if (!existsSync(file)) return null;
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new BrandConfigError(
      [`${MANIFEST_LABEL}: not valid JSON (${errorMessage(error)})`],
      [PULL_AGAIN],
    );
  }
  const parsed = manifestSchema.safeParse(data);
  if (!parsed.success) {
    const where = (path: readonly PropertyKey[]) =>
      `${MANIFEST_LABEL} ${path.map(String).join(".") || "(root)"}`;
    throw new BrandConfigError(
      parsed.error.issues.flatMap((issue) => issueLines(issue, where)),
      [PULL_AGAIN],
    );
  }
  return parsed.data;
}

/**
 * Writes `target` whole or not at all, and never through a symlink: the bytes go to a temp
 * name beside it, then a rename replaces whatever `target` was (a rename replaces a link
 * itself, never what it points to).
 */
function replaceFile(target: string, write: (temp: string) => void): void {
  const temp = join(dirname(target), `.${basename(target)}.writing`);
  rmSync(temp, { force: true });
  try {
    write(temp);
    renameSync(temp, target);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

/** Copies `source` to `target` with replaceFile; the exclusive flag never follows a link. */
export const replaceWithCopy = (source: string, target: string) =>
  replaceFile(target, (temp) => copyFileSync(source, temp, constants.COPYFILE_EXCL));

export function writeManifest(dir: string, manifest: PullManifest): void {
  replaceFile(join(dir, PULL_MANIFEST_FILE), (temp) =>
    writeFileSync(temp, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" }),
  );
}

/**
 * The contract paths of `dir` (and their folders) that are symlinks. brand:pull refuses to
 * write there: a link could point anywhere on the computer.
 */
export function symlinkedPaths(dir: string, paths: readonly string[]): string[] {
  const isLink = (path: string) =>
    lstatSync(join(dir, path), { throwIfNoEntry: false })?.isSymbolicLink() ?? false;
  const folders = new Set(paths.flatMap((path) => (path.includes("/") ? [dirname(path)] : [])));
  return [...folders, ...paths].filter(isLink);
}

/** `path` in `dir` is still the bytes the seed recorded for it. */
function isSeeded(dir: string, manifest: PullManifest | null, path: string): boolean {
  const record = manifest?.objects[path];
  const file = join(dir, path);
  return record?.source === "example" && existsSync(file) && fileSha256(file) === record.sha256;
}

/** brand.toml is still the one the seed wrote: brand:init may replace it without asking. */
export function isSeededBrandFile(repoRoot: string): boolean {
  const dir = localDir(repoRoot);
  return isSeeded(dir, readManifest(dir), BRAND_FILE);
}

/**
 * brand/local/ is still what install seeded from the example: all 17 contract files are the
 * recorded example bytes. It holds no chapter yet. A malformed manifest is not the seed.
 */
export function isUntouchedSeed(repoRoot: string): boolean {
  const dir = localDir(repoRoot);
  let manifest: PullManifest | null;
  try {
    manifest = readManifest(dir);
  } catch (error) {
    if (error instanceof BrandConfigError) return false;
    throw error;
  }
  return BUCKET_CONTRACT.every((path) => isSeeded(dir, manifest, path));
}

/**
 * Whether brand/local/ holds images brand:pull or brand:push recorded from the bucket.
 * TRANSITIONAL (the JCI Oriente removal PR drops this): how a committed chapter finds the
 * images CD pulled.
 */
export function holdsBucketImages(repoRoot: string): boolean {
  const manifest = readManifest(localDir(repoRoot));
  return IMAGE_PATHS.some((path) => manifest?.objects[path]?.source === "bucket");
}
