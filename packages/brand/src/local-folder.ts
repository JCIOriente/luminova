import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { ASSET_CONTRACT, PULL_MANIFEST_FILE } from "./assets.ts";
import { BRAND_FILE } from "./brand-file.ts";
import { BrandConfigError, errorMessage, issueLines } from "./errors.ts";
import { sha256 } from "./hash.ts";
import type { Remedy } from "./remedy.ts";

/** The one local brand folder (spec D4): the chapter's brand.toml, its images, the manifest. */
export const LOCAL_PROFILE = "local";

export const localDir = (repoRoot: string) => join(repoRoot, "brand", LOCAL_PROFILE);

/** `brand/local/<path>`, as messages name a file of the folder. */
export const localLabel = (path = "") => `brand/${LOCAL_PROFILE}/${path}`;

export const IMAGE_PATHS: readonly string[] = ASSET_CONTRACT.map(({ path }) => path);

/** The 17 paths the bucket and brand/local/ share: brand.toml, then the 16 images. */
export const BUCKET_CONTRACT: readonly string[] = [BRAND_FILE, ...IMAGE_PATHS];

const recordSchema = z.strictObject({
  generation: z.string().regex(/^\d+$/, "expected a generation number").optional(),
  md5: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/, "expected a sha256"),
  source: z.enum(["bucket", "example"]),
});

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

export function writeManifest(dir: string, manifest: PullManifest): void {
  writeFileSync(join(dir, PULL_MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
}

/** A file's hashes as the manifest records them; md5 in base64, the way gcloud lists it. */
export function fileHashes(file: string): { md5: string; sha256: string } {
  const bytes = readFileSync(file);
  return { md5: createHash("md5").update(bytes).digest("base64"), sha256: sha256(bytes) };
}

/**
 * The contract files of `dir` that changed since the manifest recorded them (a pull, a push
 * or the seed): present, and not the recorded bytes. A file the manifest does not record
 * counts as changed, so nothing unrecorded is replaced without asking.
 */
export function changedSinceRecorded(
  dir: string,
  manifest: PullManifest | null,
  paths: readonly string[] = BUCKET_CONTRACT,
): string[] {
  return paths.filter((path) => {
    const file = join(dir, path);
    if (!existsSync(file)) return false;
    return fileHashes(file).sha256 !== manifest?.objects[path]?.sha256;
  });
}

/** brand.toml is still the one the seed wrote: brand:init may replace it without asking. */
export function isSeededBrandFile(repoRoot: string): boolean {
  const dir = localDir(repoRoot);
  const record = readManifest(dir)?.objects[BRAND_FILE];
  const file = join(dir, BRAND_FILE);
  return (
    record?.source === "example" && existsSync(file) && fileHashes(file).sha256 === record.sha256
  );
}

/** Whether brand/local/ holds images brand:pull or brand:push recorded from the bucket. */
export function holdsBucketImages(repoRoot: string): boolean {
  const manifest = readManifest(localDir(repoRoot));
  return IMAGE_PATHS.some((path) => manifest?.objects[path]?.source === "bucket");
}
