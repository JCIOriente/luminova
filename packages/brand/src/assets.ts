import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { join } from "node:path";
import { errorMessage } from "./load-profile.ts";
import type { Remedy } from "./remedy.ts";
import { BRAND_APPS } from "./ports.ts";
import { PNG_HEADER_BYTES, readPngSize, type PngSize } from "./png.ts";

export const LOGO_FILES = ["logo-main.png", "logo-on-dark.png", "logo-on-primary.png"] as const;

export const OG_IMAGE_FILE = "og-image.png";
export const PULL_MANIFEST_FILE = "pull-manifest.json";
const MIN_LOGO_HEIGHT = 184;
export const OG_IMAGE_WARN_BYTES = 300 * 1024;

export const ICON_FILES = [
  { name: "favicon-16.png", size: 16 },
  { name: "favicon-32.png", size: 32 },
  { name: "apple-touch-icon-180x180.png", size: 180 },
  { name: "pwa-192x192.png", size: 192 },
  { name: "pwa-512x512.png", size: 512 },
  { name: "maskable-icon-512x512.png", size: 512 },
] as const;

export interface AssetSpec {
  path: string;
  /** Exact size; absent for logos, which only share one size and a minimum height. */
  width?: number;
  height?: number;
}

export const ASSET_CONTRACT: readonly AssetSpec[] = [
  ...LOGO_FILES.map((path) => ({ path })),
  { path: OG_IMAGE_FILE, width: 1200, height: 630 },
  ...BRAND_APPS.flatMap((app) =>
    ICON_FILES.map(({ name, size }) => ({ path: `${app}/${name}`, width: size, height: size })),
  ),
];

/** Contract paths grouped by folder (`""` for the root, else `"<app>/"`), root first. */
export function contractByFolder(): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const { path } of ASSET_CONTRACT) {
    const slash = path.lastIndexOf("/");
    const folder = slash === -1 ? "" : path.slice(0, slash + 1);
    groups.set(folder, [...(groups.get(folder) ?? []), path]);
  }
  return groups;
}

interface AssetFile {
  path: string;
  expected: string;
  /** `W×H`, `missing` or `not a PNG`. */
  found: string;
  errors: string[];
  warnings: string[];
}

export interface AssetValidation {
  errors: string[];
  warnings: string[];
  /** Each contract file with its own problems, in contract order. */
  files: AssetFile[];
  /** Why `pull-manifest.json` does not fit the profile, without the file prefix. */
  manifestError: string | null;
  /** Which kinds of problem were found, so callers can say what to do about each. */
  kinds: { files: boolean; logoSize: boolean; heavyOg: boolean };
  /** The shared size of the three logos, when they all read. */
  logoSize: PngSize | null;
}

export function describeSpec(spec: AssetSpec): string {
  return spec.width ? `${spec.width}×${spec.height}` : `PNG, height ≥ ${MIN_LOGO_HEIGHT}`;
}

function readHeader(file: string): Buffer {
  const header = Buffer.alloc(PNG_HEADER_BYTES);
  const fd = openSync(file, "r");
  try {
    return header.subarray(0, readSync(fd, header, 0, PNG_HEADER_BYTES, 0));
  } finally {
    closeSync(fd);
  }
}

const sameSize = (a: PngSize, b: PngSize) => a.width === b.width && a.height === b.height;

function checkPullManifest(dir: string, profile: string): string | null {
  const file = join(dir, PULL_MANIFEST_FILE);
  if (!existsSync(file)) return null;
  try {
    const manifest: unknown = JSON.parse(readFileSync(file, "utf8"));
    const pulled =
      typeof manifest === "object" && manifest !== null && "profile" in manifest
        ? manifest.profile
        : undefined;
    return pulled === profile
      ? null
      : `pulled for profile "${String(pulled)}", but "${profile}" is selected; re-run brand:pull`;
  } catch (error) {
    return `not valid JSON (${errorMessage(error)})`;
  }
}

function readFile(dir: string, spec: AssetSpec): { file: AssetFile; size: PngSize | null } {
  const path = join(dir, spec.path);
  const expected = describeSpec(spec);
  const file: AssetFile = { path: spec.path, expected, found: "", errors: [], warnings: [] };
  if (!existsSync(path)) {
    file.found = "missing";
    file.errors.push(`missing (expected ${expected})`);
    return { file, size: null };
  }
  const size = readPngSize(readHeader(path));
  if (!size) {
    file.found = "not a PNG";
    file.errors.push(`not a PNG (expected ${expected})`);
    return { file, size: null };
  }
  file.found = `${size.width}×${size.height}`;
  if (spec.width === undefined) {
    if (size.height < MIN_LOGO_HEIGHT) {
      file.errors.push(`${file.found} is too small (expected height ≥ ${MIN_LOGO_HEIGHT})`);
    }
  } else if (size.width !== spec.width || size.height !== spec.height) {
    file.errors.push(`${file.found}, expected ${expected}`);
  }
  const bytes = spec.path === OG_IMAGE_FILE ? statSync(path).size : 0;
  if (bytes > OG_IMAGE_WARN_BYTES) {
    file.warnings.push(
      `${Math.round(bytes / 1024)} KB is over ${OG_IMAGE_WARN_BYTES / 1024} KB; WhatsApp may skip the preview`,
    );
  }
  return { file, size };
}

/** Checks a directory against the asset contract and returns every problem at once. */
export function validateAssets(
  dir: string,
  { profile }: { profile?: string } = {},
): AssetValidation {
  const files: AssetFile[] = [];
  const logos = new Map<string, { file: AssetFile; size: PngSize }>();
  for (const spec of ASSET_CONTRACT) {
    const { file, size } = readFile(dir, spec);
    files.push(file);
    if (spec.width === undefined && size && file.errors.length === 0) {
      logos.set(spec.path, { file, size });
    }
  }

  const [mainFile] = LOGO_FILES;
  const main = logos.get(mainFile)?.size;
  let mismatched = 0;
  for (const { file, size } of logos.values()) {
    if (main && !sameSize(size, main)) {
      mismatched += 1;
      file.errors.push(
        `${size.width}×${size.height} must be the same size as ${mainFile} (${main.width}×${main.height})`,
      );
    }
  }
  const logoSize = main && logos.size === LOGO_FILES.length && mismatched === 0 ? main : null;
  const errorCount = files.reduce((total, file) => total + file.errors.length, 0);
  const manifestError = profile ? checkPullManifest(dir, profile) : null;

  const prefixed = (pick: (file: AssetFile) => string[]) =>
    files.flatMap((file) => pick(file).map((message) => `${file.path}: ${message}`));
  return {
    errors: [
      ...prefixed((file) => file.errors),
      ...(manifestError ? [`${PULL_MANIFEST_FILE}: ${manifestError}`] : []),
    ],
    warnings: prefixed((file) => file.warnings),
    files,
    manifestError,
    kinds: {
      files: errorCount > mismatched,
      logoSize: mismatched > 0,
      heavyOg: files.some((file) => file.warnings.length > 0),
    },
    logoSize,
  };
}

export const PULL_ASSETS: Remedy = {
  change: "download the images a deploy uses from the profile's bucket (needs gcloud auth login)",
  run: "pnpm brand:pull",
};

/** What to do about a validation of `dirLabel` (as the user sees it), one remedy per kind. */
export function assetRemedies(
  validation: AssetValidation,
  dirLabel: string,
  checkCommand = "pnpm brand:check",
): Remedy[] {
  const remedies: Remedy[] = [];
  if (validation.kinds.files) {
    remedies.push({
      change: `put the files marked above in ${dirLabel}/ at the sizes shown (all ${ASSET_CONTRACT.length}: docs/adopting.md step 4)`,
      run: checkCommand,
    });
  }
  if (validation.kinds.logoSize) {
    remedies.push({
      change: `export ${LOGO_FILES.join(", ")} at one size, then replace them in ${dirLabel}/`,
      run: checkCommand,
    });
  }
  if (validation.kinds.heavyOg) {
    remedies.push({
      change: `compress ${dirLabel}/${OG_IMAGE_FILE} below ${OG_IMAGE_WARN_BYTES / 1024} KB (still 1200×630)`,
    });
  }
  if (validation.manifestError) remedies.push(PULL_ASSETS);
  return remedies;
}
