import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { join } from "node:path";
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

export interface AssetFile {
  path: string;
  expected: string;
  /** `W×H`, `missing` or `not a PNG`. */
  found: string;
}

export interface AssetValidation {
  errors: string[];
  warnings: string[];
  /** What was read for each contract file, in contract order. */
  files: AssetFile[];
  /** The shared size of the three logos, when they all read. */
  logoSize: PngSize | null;
}

function expectation(spec: AssetSpec): string {
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
      : `${PULL_MANIFEST_FILE}: pulled for profile "${String(pulled)}", but "${profile}" is selected; re-run brand:pull`;
  } catch (error) {
    return `${PULL_MANIFEST_FILE}: not valid JSON (${error instanceof Error ? error.message : String(error)})`;
  }
}

/** Checks a directory against the asset contract and returns every problem at once. */
export function validateAssets(
  dir: string,
  { profile }: { profile?: string } = {},
): AssetValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const files: AssetFile[] = [];
  const logoSizes = new Map<string, PngSize>();

  for (const spec of ASSET_CONTRACT) {
    const file = join(dir, spec.path);
    const record = { path: spec.path, expected: expectation(spec) };
    if (!existsSync(file)) {
      files.push({ ...record, found: "missing" });
      errors.push(`${spec.path}: missing (expected ${expectation(spec)})`);
      continue;
    }
    const size = readPngSize(readHeader(file));
    if (!size) {
      files.push({ ...record, found: "not a PNG" });
      errors.push(`${spec.path}: not a PNG (expected ${expectation(spec)})`);
      continue;
    }
    const actual = `${size.width}×${size.height}`;
    files.push({ ...record, found: actual });
    if (spec.width === undefined) {
      if (size.height < MIN_LOGO_HEIGHT) {
        errors.push(`${spec.path}: ${actual} is too small (expected height ≥ ${MIN_LOGO_HEIGHT})`);
      } else {
        logoSizes.set(spec.path, size);
      }
    } else if (size.width !== spec.width || size.height !== spec.height) {
      errors.push(`${spec.path}: ${actual}, expected ${expectation(spec)}`);
    }
    const bytes = spec.path === OG_IMAGE_FILE ? statSync(file).size : 0;
    if (bytes > OG_IMAGE_WARN_BYTES) {
      warnings.push(
        `${spec.path}: ${Math.round(bytes / 1024)} KB is over ${OG_IMAGE_WARN_BYTES / 1024} KB; WhatsApp may skip the preview`,
      );
    }
  }

  const [mainFile] = LOGO_FILES;
  const main = logoSizes.get(mainFile);
  const mismatched = main ? [...logoSizes].filter(([, size]) => !sameSize(size, main)) : [];
  for (const [path, size] of mismatched) {
    errors.push(
      `${path}: ${size.width}×${size.height} must be the same size as ${mainFile} (${main?.width}×${main?.height})`,
    );
  }
  const logoSize =
    main && logoSizes.size === LOGO_FILES.length && mismatched.length === 0 ? main : null;

  if (profile) {
    const manifestError = checkPullManifest(dir, profile);
    if (manifestError) errors.push(manifestError);
  }

  return { errors, warnings, files, logoSize };
}
