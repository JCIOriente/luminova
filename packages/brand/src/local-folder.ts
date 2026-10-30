import {
  copyFileSync,
  constants,
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
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
import type { Remedy } from "./remedy.ts";

/** The one local brand folder (spec D4): the chapter's brand.toml, its images, the manifest. */
export const LOCAL_PROFILE = "local";

/** In brand/local/: what brand:pull, brand:push or the seed last wrote there. */
export const PULL_MANIFEST_FILE = ".pull-manifest.json";

export const localDir = (repoRoot: string) => join(repoRoot, "brand", LOCAL_PROFILE);

/** In brand/local/ while it holds brand:guard's canary chapter: the pid of the run that wrote it. */
export const CANARY_MARKER = ".canary";

/** Where brand:guard sets brand/local/ aside while the canary chapter takes its place. */
export const canaryBackupDir = (repoRoot: string) =>
  join(repoRoot, "brand", ".local-canary-backup");

export const BACKUP_LABEL = "brand/.local-canary-backup/";

/** The pid in a canary marker, when it belongs to a running process (this one included). */
function liveRunPid(marker: string): number | null {
  const pid = Number(readFileSync(marker, "utf8").trim());
  if (!Number.isInteger(pid) || pid <= 0) return null;
  if (pid === process.pid) return pid;
  try {
    process.kill(pid, 0);
    return pid;
  } catch (error) {
    // EPERM: the process exists but belongs to another user.
    return error instanceof Error && "code" in error && error.code === "EPERM" ? pid : null;
  }
}

/** The pid of the running brand:guard (this one included) whose canary is in brand/local/. */
export function liveCanaryPid(repoRoot: string): number | null {
  const marker = join(localDir(repoRoot), CANARY_MARKER);
  return existsSync(marker) ? liveRunPid(marker) : null;
}

/**
 * brand/local/ is brand:guard's: it holds the marker, or nothing at all (a kill between
 * renaming the folder aside and writing the marker).
 */
function holdsCanary(dir: string): boolean {
  return existsSync(join(dir, CANARY_MARKER)) || readdirSync(dir).length === 0;
}

/**
 * Takes the canary chapter out of brand/local/ and renames what brand:guard set aside back,
 * exactly as it was; brand/local/ stays absent when nothing was set aside (it was absent).
 * Returns whether a set-aside folder came back.
 */
export function restoreFromCanary(repoRoot: string): boolean {
  const dir = localDir(repoRoot);
  const backup = canaryBackupDir(repoRoot);
  if (existsSync(dir) && holdsCanary(dir)) rmSync(dir, { recursive: true, force: true });
  if (!existsSync(backup)) return false;
  if (existsSync(dir)) {
    throw new BrandConfigError(
      [
        `${BACKUP_LABEL} holds the ${localLabel()} an interrupted brand:guard set aside, but ${localLabel()} holds another folder now`,
      ],
      [{ change: `keep the one that is your chapter's as ${localLabel()} and delete the other` }],
    );
  }
  renameSync(backup, dir);
  return true;
}

/**
 * Undoes what an interrupted brand:guard (Ctrl-C past its handlers, a crash, SIGKILL) left:
 * its canary chapter in brand/local/, the member's folder set aside. A canary whose run is
 * still alive is left alone. Returns a one-line notice when it changed anything.
 */
export function recoverInterruptedCanary(repoRoot: string): string | null {
  const marker = join(localDir(repoRoot), CANARY_MARKER);
  const hasCanary = existsSync(marker);
  if (!hasCanary && !existsSync(canaryBackupDir(repoRoot))) return null;
  if (hasCanary && liveRunPid(marker) !== null) return null;
  return restoreFromCanary(repoRoot)
    ? `put back the ${localLabel()} an interrupted brand:guard had set aside for its canary chapter`
    : `removed the canary chapter an interrupted brand:guard left in ${localLabel()}`;
}

/** `brand/local/<path>`, as messages name a file of the folder. */
export const localLabel = (path = "") => `brand/${LOCAL_PROFILE}/${path}`;

export const IMAGE_PATHS: readonly string[] = ASSET_CONTRACT.map(({ path }) => path);

/** The 17 paths the bucket and brand/local/ share: brand.toml, then the 16 images. */
export const BUCKET_CONTRACT: readonly string[] = [BRAND_FILE, ...IMAGE_PATHS];

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
