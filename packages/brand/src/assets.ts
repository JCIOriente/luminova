import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { BrandApp } from "./ports.ts";
import { readPngSize, type PngSize } from "./png.ts";

export const LOGO_FILES = ["logo-main.png", "logo-on-dark.png", "logo-on-primary.png"] as const;
export type LogoFile = (typeof LOGO_FILES)[number];

export const OG_IMAGE_FILE = "og-image.png";
export const PULL_MANIFEST_FILE = "pull-manifest.json";
export const MIN_LOGO_HEIGHT = 184;
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
  ...(["spotlight", "backstage"] satisfies BrandApp[]).flatMap((app) =>
    ICON_FILES.map(({ name, size }) => ({ path: `${app}/${name}`, width: size, height: size })),
  ),
];

export interface AssetValidation {
  errors: string[];
  warnings: string[];
  /** The shared size of the three logos, when they all read. */
  logoSize: PngSize | null;
}

function expectation(spec: AssetSpec): string {
  return spec.width ? `${spec.width}×${spec.height}` : `PNG, height ≥ ${MIN_LOGO_HEIGHT}`;
}

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
  const logoSizes = new Map<string, PngSize>();

  for (const spec of ASSET_CONTRACT) {
    const file = join(dir, spec.path);
    if (!existsSync(file)) {
      errors.push(`${spec.path}: missing (expected ${expectation(spec)})`);
      continue;
    }
    const bytes = readFileSync(file);
    const size = readPngSize(bytes);
    if (!size) {
      errors.push(`${spec.path}: not a PNG (expected ${expectation(spec)})`);
      continue;
    }
    const actual = `${size.width}×${size.height}`;
    if (spec.width === undefined) {
      if (size.height < MIN_LOGO_HEIGHT) {
        errors.push(`${spec.path}: ${actual} is too small (expected height ≥ ${MIN_LOGO_HEIGHT})`);
      } else {
        logoSizes.set(spec.path, size);
      }
    } else if (size.width !== spec.width || size.height !== spec.height) {
      errors.push(`${spec.path}: ${actual}, expected ${expectation(spec)}`);
    }
    if (spec.path === OG_IMAGE_FILE && bytes.length > OG_IMAGE_WARN_BYTES) {
      warnings.push(
        `${spec.path}: ${Math.round(bytes.length / 1024)} KB is over 300 KB; WhatsApp may skip the preview`,
      );
    }
  }

  const main = logoSizes.get("logo-main.png");
  let logoSize: PngSize | null = main && logoSizes.size === LOGO_FILES.length ? main : null;
  if (main) {
    for (const [path, size] of logoSizes) {
      if (size.width !== main.width || size.height !== main.height) {
        errors.push(
          `${path}: ${size.width}×${size.height} must be the same size as logo-main.png (${main.width}×${main.height})`,
        );
        logoSize = null;
      }
    }
  }

  if (profile) {
    const manifestError = checkPullManifest(dir, profile);
    if (manifestError) errors.push(manifestError);
  }

  return { errors, warnings, logoSize };
}
