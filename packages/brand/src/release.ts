import { existsSync, readFileSync } from "node:fs";
import { GUIDE_STEPS, guideStep } from "./remedy.ts";
import { isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";
import { ASSET_CONTRACT, PULL_ASSETS, PULL_MANIFEST_FILE } from "./assets.ts";
import { sha256 } from "./hash.ts";
import type { Problem, Remedy } from "./remedy.ts";
import {
  BrandConfigError,
  NEUTRAL_PROFILE,
  PROFILE_OVERRIDE_ENV,
  REMOVE_OVERRIDE,
  issuesToBrandError,
  readJsonFile,
  type Env,
  type LoadedProfile,
} from "./load-profile.ts";

/** Release mode (spec section 5.6): the deploy build. Only `build:release`, `deploy:*` and CD set it. */
const RELEASE_ENV = "BRAND_RELEASE";
export const RELEASE_MARKER_FILE = ".brand-release.json";
export const PULLED_ASSETS_DIR = "brand-assets";

/** How a local-only profile goes live: a real project, then `--connect`. */
export const CONNECT_PROJECT: Remedy = {
  change: `when you are ready to go live: create a Firebase project (${guideStep("firebaseProject")}), then connect it (step ${GUIDE_STEPS.connect})`,
  run: "pnpm brand:init --connect",
};

const releaseMarkerSchema = z.strictObject({
  profile: z.string().min(1),
  projectId: z.string().min(1),
  assets: z.string().regex(/^[0-9a-f]{64}$/, "expected the pull manifest's sha256"),
  // Ties the marker to the build it was written with: a turbo cache replay restores a
  // different dist on top of it without deleting it.
  indexHtml: z.string().regex(/^[0-9a-f]{64}$/, "expected the sha256 of index.html"),
});

export type ReleaseMarker = z.infer<typeof releaseMarkerSchema>;
/** What the build knows before it emits: the marker minus the index.html digest. */
export type ReleaseIdentity = Omit<ReleaseMarker, "indexHtml">;

export function isRelease(env: Env): boolean {
  const value = env[RELEASE_ENV]?.trim();
  if (!value || value === "0") return false;
  if (value === "1") return true;
  // A typo must not quietly produce a dist without the marker that predeploy requires.
  throw new BrandConfigError(
    [`${RELEASE_ENV} must be "1" (release) or unset; got "${value}".`],
    [
      {
        change: `remove it from your environment: only pnpm build:release, pnpm deploy:* and CD set it`,
        run: `unset ${RELEASE_ENV}`,
        where: "shell",
      },
    ],
  );
}

const RELEASE_BUILD_COMMAND = "pnpm build:release";

/** What ships when nothing is passed: the profile brand/ selects (spec P1). */
const SHIP_CHAPTER: Remedy = {
  change:
    "drop --profile and BRAND_PROFILE so the profile found in brand/ ships, or pass --profile with your chapter",
};

/**
 * A profile that may reach production: found in brand/ or chosen with --profile (never a
 * stray environment override; spec P5), not the fixture, not an emulator-only project. Release
 * builds, brand:push and brand:provision --apply share it.
 */
export const PRINT_GCP_SETUP: Remedy = {
  change:
    "print this profile's Google Cloud setup, step by step, with your values (changes nothing)",
  run: "pnpm brand:provision",
};

/**
 * CD signs in with the profile's `deploy` names; without them no deploy can start.
 * Twin: .github/scripts/deploy-ready.sh makes Deploy skip on the same rule.
 */
export function missingDeployProblem({ slug, brand }: LoadedProfile): Problem | null {
  if (brand.deploy) return null;
  return {
    message: `brand/${slug}/brand.json has no "deploy" section (CD's sign-in, needed to deploy): copy it from step 2 of pnpm brand:provision.`,
    remedies: [PRINT_GCP_SETUP],
  };
}

export function undeployableProfileErrors(profile: LoadedProfile): Problem[] {
  const errors: Problem[] = [];
  const { slug } = profile;
  const { projectId } = profile.brand.firebase;
  if (profile.source === "override") {
    errors.push({
      message: `${PROFILE_OVERRIDE_ENV}=${slug} is set in your environment; what ships is the profile found in brand/, or --profile.`,
      remedies: [REMOVE_OVERRIDE],
    });
  }
  if (slug === NEUTRAL_PROFILE) {
    errors.push({
      message: `profile "${slug}" is the neutral test profile and can never be released.`,
      remedies: [SHIP_CHAPTER],
    });
  }
  if (profile.localOnly) {
    errors.push({
      message: `profile "${slug}" is local-only (project "${projectId}" exists only in the emulators), so it cannot be released.`,
      remedies: [CONNECT_PROJECT],
    });
  }
  return errors;
}

/**
 * Where a build, `brand:check` and `brand:push` read the asset set: release always reads the
 * pulled `brand-assets/`; otherwise the `BRAND_ASSETS_DIR` tooling override, then
 * `brand-assets/` once it holds any contract file (brand:init leaves only a README there),
 * then the profile's own `assets/`. A profile without its own assets reads `brand-assets/`,
 * so its errors name the folder to fill.
 */
export function selectAssetsDir(
  repoRoot: string,
  profile: LoadedProfile,
  env: Env,
  release: boolean,
): string {
  const pulled = join(repoRoot, PULLED_ASSETS_DIR);
  if (release) return pulled;
  const fromEnv = env.BRAND_ASSETS_DIR?.trim();
  if (fromEnv) return resolve(repoRoot, fromEnv);
  const own = join(profile.dir, "assets");
  const pulledHasAssets = ASSET_CONTRACT.some(({ path }) => existsSync(join(pulled, path)));
  return pulledHasAssets || !existsSync(own) ? pulled : own;
}

/** A directory as the user should read it: relative inside the repo, absolute outside it. */
export function displayDir(repoRoot: string, dir: string): string {
  const path = relative(repoRoot, dir);
  return path.startsWith("..") || isAbsolute(path) ? dir : path || ".";
}

/** Every release-only rule that fails, so one build lists them all. */
export function releaseErrors({
  profile,
  env,
  assetsDir,
  command,
  emulatorEnabled,
}: {
  profile: LoadedProfile;
  env: Env;
  assetsDir: string;
  command: "serve" | "build";
  emulatorEnabled: boolean;
}): Problem[] {
  const errors = undeployableProfileErrors(profile);
  const { slug } = profile;
  const { projectId } = profile.brand.firebase;
  if (command !== "build" || emulatorEnabled) {
    errors.push({
      message:
        "release mode needs a production `vite build` with VITE_FIREBASE_EMULATOR_ENABLED unset or false.",
      remedies: [
        { change: "build for release with the script made for it", run: RELEASE_BUILD_COMMAND },
      ],
    });
  }
  if (env.BRAND_ASSETS_DIR?.trim()) {
    errors.push({
      message: `BRAND_ASSETS_DIR is not allowed in release mode; release assets come only from ${PULLED_ASSETS_DIR}/.`,
      remedies: [
        {
          change: "remove it from your environment (tools set it for test builds only)",
          run: "unset BRAND_ASSETS_DIR",
          where: "shell",
        },
      ],
    });
  }
  const target = env.GCP_PROJECT_ID?.trim();
  if (target && target !== projectId) {
    errors.push({
      message: `GCP_PROJECT_ID "${target}" is not profile "${slug}"'s project "${projectId}".`,
      remedies: [
        {
          change: `set GCP_PROJECT_ID to "${projectId}", or pass --profile with the profile whose firebase.projectId is "${target}"`,
        },
      ],
    });
  }
  if (!existsSync(join(assetsDir, PULL_MANIFEST_FILE))) {
    errors.push({
      message: `no ${PULL_MANIFEST_FILE} in ${PULLED_ASSETS_DIR}/: a deploy only uses images downloaded with brand:pull.`,
      remedies: [PULL_ASSETS],
    });
  }
  return errors;
}

export function releaseIdentity(profile: LoadedProfile, assetsDir: string): ReleaseIdentity {
  return {
    profile: profile.slug,
    projectId: profile.brand.firebase.projectId,
    assets: sha256(readFileSync(join(assetsDir, PULL_MANIFEST_FILE))),
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
