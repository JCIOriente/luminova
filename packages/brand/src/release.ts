import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { PULL_MANIFEST_FILE } from "./assets.ts";
import { issuesToBrandError, readJsonFile, type LoadedProfile } from "./load-profile.ts";

/** Release mode (spec section 5.6): the deploy build. CD and `deploy:hosting` set it. */
export const RELEASE_ENV = "BRAND_RELEASE";
export const RELEASE_MARKER_FILE = ".brand-release.json";
export const PULLED_ASSETS_DIR = "brand-assets";
const NEUTRAL_PROFILE = "fixture";
const DEMO_PROJECT_PREFIX = "demo-";

type Env = Readonly<Record<string, string | undefined>>;

const releaseMarkerSchema = z.strictObject({
  profile: z.string().min(1),
  projectId: z.string().min(1),
  assets: z.string().regex(/^[0-9a-f]{64}$/, "expected the pull manifest's sha256"),
});

export type ReleaseMarker = z.infer<typeof releaseMarkerSchema>;

export function isRelease(env: Env): boolean {
  const value = env[RELEASE_ENV]?.trim();
  if (!value || value === "0") return false;
  if (value === "1") return true;
  // A typo must not quietly produce a dist without the marker that predeploy requires.
  throw new Error(`${RELEASE_ENV} must be "1" (release) or unset; got "${value}".`);
}

/** Every release-only rule that fails, so one build lists them all. */
export function releaseErrors({
  profile,
  env,
  assetsDir,
}: {
  profile: LoadedProfile;
  env: Env;
  assetsDir: string;
}): string[] {
  const errors: string[] = [];
  const { slug } = profile;
  const { projectId } = profile.brand.firebase;
  if (profile.source === "default") {
    errors.push(
      "BRAND_PROFILE is required in release mode; set it to the profile this deploy ships.",
    );
  }
  if (slug === NEUTRAL_PROFILE) {
    errors.push(`profile "${slug}" is the neutral test profile and can never be released.`);
  }
  if (projectId.startsWith(DEMO_PROJECT_PREFIX)) {
    errors.push(
      `profile "${slug}": project "${projectId}" is an emulator-only demo project and cannot be released.`,
    );
  }
  if (env.BRAND_ASSETS_DIR?.trim()) {
    errors.push(
      `BRAND_ASSETS_DIR is not allowed in release mode; release assets come only from ${PULLED_ASSETS_DIR}/ (run brand:pull).`,
    );
  }
  const target = env.GCP_PROJECT_ID?.trim();
  if (target && target !== projectId) {
    errors.push(
      `GCP_PROJECT_ID "${target}" is not profile "${slug}"'s project "${projectId}"; select the matching BRAND_PROFILE.`,
    );
  }
  if (!existsSync(join(assetsDir, PULL_MANIFEST_FILE))) {
    errors.push(
      `${PULLED_ASSETS_DIR}/${PULL_MANIFEST_FILE}: missing; release assets must come from brand:pull.`,
    );
  }
  return errors;
}

export function releaseMarker(profile: LoadedProfile, assetsDir: string): ReleaseMarker {
  const manifest = readFileSync(join(assetsDir, PULL_MANIFEST_FILE));
  return {
    profile: profile.slug,
    projectId: profile.brand.firebase.projectId,
    assets: createHash("sha256").update(manifest).digest("hex"),
  };
}

/** The marker in a built `dist`, or null for a non-release build. */
export function readReleaseMarker(distDir: string): ReleaseMarker | null {
  const file = join(distDir, RELEASE_MARKER_FILE);
  if (!existsSync(file)) return null;
  const parsed = releaseMarkerSchema.safeParse(readJsonFile(file, RELEASE_MARKER_FILE));
  if (!parsed.success) throw issuesToBrandError(RELEASE_MARKER_FILE, parsed.error.issues);
  return parsed.data;
}
