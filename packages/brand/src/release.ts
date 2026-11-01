import { existsSync } from "node:fs";
import { GUIDE_STEPS, guideStep } from "./remedy.ts";
import { isAbsolute, join, relative } from "node:path";
import { z } from "zod";
import { PULL_ASSETS } from "./assets.ts";
import { fileSha256 } from "./hash.ts";
import {
  MANIFEST_LABEL,
  BUCKET_CONTRACT,
  PULL_MANIFEST_FILE,
  localDir,
  localLabel,
  readManifest,
} from "./local-folder.ts";
import type { Problem, Remedy } from "./remedy.ts";
import {
  BrandConfigError,
  EXAMPLE_PROFILE,
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

/** How a local-only profile goes live: a real project, then brand:init connects it. */
export const CONNECT_PROJECT: Remedy = {
  change: `when you are ready to go live: create a Firebase project (${guideStep("firebaseProject")}), then run this and answer y to connect it (step ${GUIDE_STEPS.connect})`,
  run: "pnpm brand:init",
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

/** What ships is the chapter's own profile, found in brand/ (spec P1). */
const SHIP_CHAPTER: Remedy = {
  change:
    "release your chapter's own profile (pnpm brand:init creates it), with BRAND_PROFILE unset",
};

/**
 * A profile that may reach production: found in brand/ or named by its caller (never a
 * stray environment override; spec P5), not the example, not an emulator-only project. Release
 * builds, brand:push and brand:provision's bucket step share it.
 */
export function undeployableProfileErrors(profile: LoadedProfile): Problem[] {
  const errors: Problem[] = [];
  const { slug } = profile;
  const { projectId } = profile.brand.firebase;
  if (profile.source === "override") {
    errors.push({
      message: `${PROFILE_OVERRIDE_ENV}=${slug} is set in your environment; what ships is the profile found in brand/.`,
      remedies: [REMOVE_OVERRIDE],
    });
  }
  if (slug === EXAMPLE_PROFILE) {
    errors.push({
      message: `profile "${slug}" is the example and can never be released.`,
      remedies: [SHIP_CHAPTER],
    });
  } else if (profile.localOnly) {
    errors.push({
      message: `profile "${slug}" is local-only (project "${projectId}" exists only in the emulators), so it cannot be released.`,
      remedies: [CONNECT_PROJECT],
    });
  }
  return errors;
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
  repoRoot,
  command,
  emulatorEnabled,
}: {
  profile: LoadedProfile;
  env: Env;
  repoRoot: string;
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
  const target = env.GCP_PROJECT_ID?.trim();
  if (target && target !== projectId) {
    errors.push({
      message: `GCP_PROJECT_ID "${target}" is not profile "${slug}"'s project "${projectId}".`,
      remedies: [
        {
          change: `set GCP_PROJECT_ID to "${projectId}", the project of the profile found in brand/`,
        },
      ],
    });
  }
  errors.push(...pulledFileErrors(profile, repoRoot));
  return errors;
}

const PUSH_OR_PULL = {
  change:
    "upload your change to the bucket, or replace it with the bucket's copy (pnpm brand:pull)",
  run: "pnpm brand:push",
};

/**
 * A release ships only what brand:pull downloaded into brand/local/ (spec "Release builds"):
 * every contract file recorded with source `bucket` and still those bytes.
 */
function pulledFileErrors(profile: LoadedProfile, repoRoot: string): Problem[] {
  const dir = localDir(repoRoot);
  const manifest = readManifest(dir);
  if (!manifest) {
    return [
      {
        message: `no ${MANIFEST_LABEL}: a deploy only uses files downloaded with brand:pull.`,
        remedies: [PULL_ASSETS],
      },
    ];
  }
  const { projectId } = profile.brand.firebase;
  if (manifest.project !== projectId) {
    return [
      {
        message: `${MANIFEST_LABEL}: pulled from project "${manifest.project}", but the profile deploys "${projectId}"`,
        remedies: [PULL_ASSETS],
      },
    ];
  }
  return BUCKET_CONTRACT.flatMap((path): Problem[] => {
    const record = manifest.objects[path];
    const file = join(dir, path);
    const label = localLabel(path);
    if (!record) {
      return [
        {
          message: `${label}: not in ${MANIFEST_LABEL}, so not pulled from the bucket`,
          remedies: [PULL_ASSETS],
        },
      ];
    }
    if (record.source !== "bucket") {
      return [
        {
          message: `${label}: the seeded example's copy, never pulled from the bucket`,
          remedies: [PULL_ASSETS],
        },
      ];
    }
    if (!existsSync(file)) {
      return [
        {
          message: `${label}: missing, though brand:pull downloaded it`,
          remedies: [PULL_ASSETS],
        },
      ];
    }
    if (fileSha256(file) !== record.sha256) {
      return [
        {
          message: `${label}: changed after brand:pull; upload it with brand:push, or pull again`,
          remedies: [PUSH_OR_PULL],
        },
      ];
    }
    return [];
  });
}

export function releaseIdentity(profile: LoadedProfile, repoRoot: string): ReleaseIdentity {
  return {
    profile: profile.slug,
    projectId: profile.brand.firebase.projectId,
    assets: fileSha256(join(localDir(repoRoot), PULL_MANIFEST_FILE)),
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
