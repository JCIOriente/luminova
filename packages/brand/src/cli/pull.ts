import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { ASSET_CONTRACT, contractByFolder, validateAssets } from "../assets.ts";
import { BRAND_FILE, readBrandToml, resolveBrandFile } from "../brand-file.ts";
import {
  BrandConfigError,
  EXAMPLE_PROFILE,
  REPO_ROOT,
  brandFileLabel,
  issuesToBrandError,
  parseJsonText,
  readBase,
  type LoadedProfile,
} from "../load-profile.ts";
import {
  changedSinceRecorded,
  fileHashes,
  localDir,
  localLabel,
  readManifest,
  writeManifest,
  type ObjectRecord,
  type PullManifest,
} from "../local-folder.ts";
import { undeployableProfileErrors } from "../release.ts";
import { formatNext, type Remedy } from "../remedy.ts";
import { bucketUrl, runCommand, type CommandRunner } from "./gcloud.ts";
import { runCli } from "./main.ts";
import { terminalConfirm, type Confirm } from "./prompts.ts";

const listingSchema = z.array(
  z.looseObject({
    name: z.string(),
    generation: z.union([z.string(), z.number()]).transform(String),
  }),
);

export const PULL_NEXT: readonly Remedy[] = [
  { change: "deploy the sites with these images (project owner)", run: "pnpm deploy:hosting" },
];

export interface PullResult {
  manifest: PullManifest;
  /** Whether the bucket held a brand.toml (TRANSITION: JCI Oriente's gets one from the runbook). */
  brandFile: boolean;
}

/** The bucket's brand.toml must load, on the example, and name the bucket's own project. */
function checkBrandFile(file: string, bucket: string, profile: LoadedProfile, repoRoot: string) {
  const label = bucketUrl(bucket, BRAND_FILE);
  const { brand } = resolveBrandFile({
    slug: profile.slug,
    chapter: readBrandToml(file, label),
    base: readBase(repoRoot),
    label,
    baseLabel: brandFileLabel(EXAMPLE_PROFILE),
  });
  const { projectId } = profile.brand.firebase;
  if (brand.firebase.projectId !== projectId) {
    throw new BrandConfigError([
      `${label}: names project "${brand.firebase.projectId}", but this is the bucket of "${projectId}"`,
    ]);
  }
}

const PUSH_INSTEAD: Remedy = {
  change: "or upload your changed files to the bucket instead",
  run: "pnpm brand:push",
};

/**
 * Downloads the selected profile's contract files from its bucket into brand/local/ (spec
 * "brand:pull"). Downloads land in a scratch dir and are validated whole first, so a failed
 * pull changes nothing. A local file changed since the manifest recorded it is replaced only
 * after one yes; everything outside the contract stays.
 */
export async function pull({
  profile,
  repoRoot = REPO_ROOT,
  run = runCommand,
  confirm,
}: {
  profile: LoadedProfile;
  repoRoot?: string;
  run?: CommandRunner;
  /** The terminal's yes/no; absent in CD or a script, where a changed file stops the pull. */
  confirm?: Confirm;
}): Promise<PullResult> {
  const refused = undeployableProfileErrors(profile);
  if (refused.length > 0) throw new BrandConfigError(refused);
  const bucket = profile.brand.assetsBucket;
  const label = `gcloud listing of ${bucketUrl(bucket)}`;
  // gs://bucket alone lists one directory level; ** reaches spotlight/ and backstage/.
  const raw = await run("gcloud", [
    "storage",
    "objects",
    "list",
    bucketUrl(bucket, "**"),
    "--format=json",
  ]);
  const listing = listingSchema.safeParse(parseJsonText(raw, label));
  if (!listing.success) throw issuesToBrandError(label, listing.error.issues);
  const generations = new Map(listing.data.map(({ name, generation }) => [name, generation]));

  const missing = ASSET_CONTRACT.filter(({ path }) => !generations.has(path)).map(
    ({ path }) => `${bucketUrl(bucket, path)}: missing from the bucket (upload it with brand:push)`,
  );
  if (missing.length > 0) {
    throw new BrandConfigError(missing, [
      { change: "upload the full set to the bucket (project owner)", run: "pnpm brand:push" },
    ]);
  }
  const brandFile = generations.has(BRAND_FILE);
  const folders = contractByFolder();
  if (brandFile) folders.set("", [BRAND_FILE, ...(folders.get("") ?? [])]);
  const pulled = [...folders.values()].flat();

  const cacheDir = join(repoRoot, "node_modules", ".cache");
  mkdirSync(cacheDir, { recursive: true });
  const staging = mkdtempSync(join(cacheDir, "luminova-brand-pull-"));
  try {
    // One cp per folder: the destinations differ, and the folders download in parallel.
    await Promise.all(
      [...folders].map(([folder, paths]) => {
        const target = join(staging, folder);
        mkdirSync(target, { recursive: true });
        const sources = paths.map((path) => `${bucketUrl(bucket, path)}#${generations.get(path)}`);
        return run("gcloud", ["storage", "cp", ...sources, `${target}/`]);
      }),
    );

    const validation = validateAssets(staging);
    if (validation.errors.length > 0) {
      throw new BrandConfigError(
        validation.errors.map((error) => bucketUrl(bucket, error)),
        [
          {
            change:
              "the bucket holds the invalid files listed above: fix your images (pnpm brand:check names any problem), then upload them again",
            run: "pnpm brand:push",
          },
        ],
      );
    }
    if (brandFile) checkBrandFile(join(staging, BRAND_FILE), bucket, profile, repoRoot);

    const dir = localDir(repoRoot);
    const previous = readManifest(dir);
    const staged = (path: string) => fileHashes(join(staging, path)).sha256;
    const changed = changedSinceRecorded(dir, previous, pulled).filter(
      (path) => fileHashes(join(dir, path)).sha256 !== staged(path),
    );
    if (changed.length > 0) await confirmReplacing(changed, confirm);

    const objects: Record<string, ObjectRecord> = {};
    // Without one in the bucket, the local brand.toml keeps what was recorded about it.
    const kept = brandFile ? undefined : previous?.objects[BRAND_FILE];
    if (kept) objects[BRAND_FILE] = kept;
    for (const path of pulled) {
      const target = join(dir, path);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(staging, path), target);
      objects[path] = {
        generation: generations.get(path),
        ...fileHashes(target),
        source: "bucket",
      };
    }
    const manifest: PullManifest = {
      version: 1,
      project: profile.brand.firebase.projectId,
      bucket,
      objects,
    };
    writeManifest(dir, manifest);
    return { manifest, brandFile };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

/** One question for every changed file; no, or no terminal to ask on, changes nothing. */
async function confirmReplacing(changed: readonly string[], confirm: Confirm | undefined) {
  const since = "changed since the last pull, push or seed";
  if (!confirm) {
    throw new BrandConfigError(
      [
        `${localLabel()} files ${since}: ${changed.join(", ")}. brand:pull asks before replacing them, so it needs a terminal.`,
      ],
      [
        { change: "run it in a terminal and answer y to replace them", run: "pnpm brand:pull" },
        PUSH_INSTEAD,
      ],
    );
  }
  const question = [
    `These files in ${localLabel()} ${since}:`,
    ...changed.map((path) => `  ${path}`),
    `Replace these ${changed.length} files with the bucket's copy?`,
  ].join("\n");
  if (await confirm(question)) return;
  throw new BrandConfigError(
    [
      `brand:pull changed nothing: you kept your ${changed.length} changed files (${changed.join(", ")}).`,
    ],
    [PUSH_INSTEAD],
  );
}

if (import.meta.main) {
  await runCli("brand:pull", async (profile) => {
    const { manifest, brandFile } = await pull({ profile, confirm: terminalConfirm() });
    const files = Object.entries(manifest.objects).filter(([, { source }]) => source === "bucket");
    console.error(
      `brand:pull: ${files.length} files from ${bucketUrl(manifest.bucket)} into ${localLabel()} (project ${manifest.project}).`,
    );
    for (const [path, { generation }] of files) console.error(`  ${path}#${generation ?? ""}`);
    if (!brandFile) {
      // TRANSITION: JCI Oriente's bucket gets its brand.toml from the owner runbook.
      console.error(
        `  The bucket holds no ${BRAND_FILE} yet: images only; ${localLabel(BRAND_FILE)} was left as it was.`,
      );
    }
    console.error(`\n${formatNext(PULL_NEXT)}`);
  });
}
