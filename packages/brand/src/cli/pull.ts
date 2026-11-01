import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { ASSET_CONTRACT, contractByFolder, validateAssets } from "../assets.ts";
import { BRAND_FILE, readBrandToml, resolveBrandFile } from "../brand-file.ts";
import { fileSha256 } from "../hash.ts";
import {
  BrandConfigError,
  EXAMPLE_PROFILE,
  REPO_ROOT,
  brandFileLabel,
  readBase,
  type LoadedProfile,
} from "../load-profile.ts";
import {
  BUCKET_CONTRACT,
  localDir,
  localLabel,
  readManifest,
  replaceWithCopy,
  symlinkedPaths,
  writeManifest,
  type ObjectRecord,
  type PullManifest,
} from "../local-folder.ts";
import { undeployableProfileErrors } from "../release.ts";
import { formatNext, type Remedy } from "../remedy.ts";
import { bucketUrl, listBucket, runCommand, type CommandRunner } from "./gcloud.ts";
import { runCli } from "./main.ts";
import { terminalConfirm, type Confirm } from "./prompts.ts";

export const PULL_NEXT: readonly Remedy[] = [
  { change: "deploy the sites with these images (project owner)", run: "pnpm deploy:hosting" },
];

export interface PullResult {
  manifest: PullManifest;
  /** Whether the bucket held a brand.toml. */
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

/** A link in brand/local/ could point anywhere on the computer, so nothing is written through one. */
function refuseSymlinks(dir: string, paths: readonly string[]): void {
  const linked = symlinkedPaths(dir, paths);
  if (linked.length === 0) return;
  throw new BrandConfigError(
    linked.map((path) => `${localLabel(path)}: a symlink; brand:pull never writes through one`),
    [{ change: "replace each with a plain file or folder (or delete it)", run: "pnpm brand:pull" }],
  );
}

/**
 * Downloads the selected profile's contract files from its bucket into brand/local/ (spec
 * "brand:pull"). Downloads land in a scratch dir and are validated whole first, so a failed
 * pull changes nothing. A local file changed since the manifest recorded it is replaced only
 * after one yes; everything outside the contract stays. Each file is replaced whole (a temp
 * copy, then a rename), and the manifest records exactly the files replaced, even when a
 * copy fails part way.
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
  const generations = await listBucket(run, bucket);

  const missing = ASSET_CONTRACT.filter(({ path }) => !generations.has(path)).map(
    ({ path }) => `${bucketUrl(bucket, path)}: missing from the bucket (upload it with brand:push)`,
  );
  if (missing.length > 0) {
    throw new BrandConfigError(missing, [
      { change: "upload the full set to the bucket (project owner)", run: "pnpm brand:push" },
    ]);
  }
  // TRANSITIONAL (the fork-CD PR drops this): a bucket without brand.toml (JCI Oriente's,
  // until the owner runbook) gives only its images.
  const brandFile = generations.has(BRAND_FILE);
  const folders = contractByFolder();
  if (brandFile) folders.set("", [BRAND_FILE, ...(folders.get("") ?? [])]);
  const pulled = [...folders.values()].flat();
  const dir = localDir(repoRoot);
  refuseSymlinks(dir, pulled);

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

    const previous = readManifest(dir);
    const staged = new Map(pulled.map((path) => [path, fileSha256(join(staging, path))]));
    const local = new Map(
      pulled
        .filter((path) => existsSync(join(dir, path)))
        .map((path) => [path, fileSha256(join(dir, path))]),
    );
    const changed = pulled.filter((path) => {
      const hash = local.get(path);
      return (
        hash !== undefined && hash !== previous?.objects[path]?.sha256 && hash !== staged.get(path)
      );
    });
    if (changed.length > 0) await confirmReplacing(changed, confirm);

    const replaced = new Set<string>();
    const record = (): PullManifest => {
      const objects: Record<string, ObjectRecord> = {};
      for (const path of BUCKET_CONTRACT) {
        const generation = generations.get(path);
        const sha256 = staged.get(path);
        const kept = previous?.objects[path];
        if (replaced.has(path) && generation !== undefined && sha256 !== undefined) {
          objects[path] = { source: "bucket", generation, sha256 };
        } else if (kept && (kept.source === "example" || previous?.bucket === bucket)) {
          // A file this pull did not replace keeps its record: one a failed copy left as it
          // was and, TRANSITIONAL (the fork-CD PR drops this), the local brand.toml while the
          // bucket holds none.
          objects[path] = kept;
        }
      }
      return { version: 1, project: profile.brand.firebase.projectId, bucket, objects };
    };
    try {
      for (const path of pulled) {
        const target = join(dir, path);
        mkdirSync(dirname(target), { recursive: true });
        if (local.get(path) !== staged.get(path)) replaceWithCopy(join(staging, path), target);
        replaced.add(path);
      }
    } finally {
      // A copy that failed part way still leaves a manifest true to the files on disk.
      if (replaced.size > 0) writeManifest(dir, record());
    }
    return { manifest: record(), brandFile };
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
    const files = Object.entries(manifest.objects).flatMap(([path, record]) =>
      record.source === "bucket" ? [`  ${path}#${record.generation}`] : [],
    );
    console.error(
      `brand:pull: ${files.length} files from ${bucketUrl(manifest.bucket)} into ${localLabel()} (project ${manifest.project}).`,
    );
    for (const line of files) console.error(line);
    if (!brandFile) {
      // TRANSITIONAL (the fork-CD PR drops this): JCI Oriente's bucket gets its brand.toml
      // from the owner runbook.
      console.error(
        `  The bucket holds no ${BRAND_FILE} yet: images only; ${localLabel(BRAND_FILE)} was left as it was.`,
      );
    }
    console.error(`\n${formatNext(PULL_NEXT)}`);
  });
}
