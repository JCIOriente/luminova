import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BrandConfigError, REPO_ROOT, type LoadedProfile } from "../load-profile.ts";
import { isRelease, undeployableProfileErrors } from "../release.ts";
import type { Brand } from "../schema.ts";
import { runCli } from "./main.ts";

export const FIREBASERC = ".firebaserc";

/** `.firebaserc` is generated, never committed: its project, sites and bucket are brand values. */
export function renderFirebaserc({ firebase }: Brand) {
  return {
    projects: { default: firebase.projectId },
    targets: {
      [firebase.projectId]: {
        storage: { default: [firebase.storageBucket] },
        hosting: {
          spotlight: [firebase.sites.spotlight],
          backstage: [firebase.sites.backstage],
        },
      },
    },
    etags: {},
  };
}

export const firebasercContent = (brand: Brand) =>
  `${JSON.stringify(renderFirebaserc(brand), null, 2)}\n`;

/** Writes `.firebaserc`; under BRAND_RELEASE=1 (CD) only for a profile that may ship. */
export function applyProfile({
  profile,
  repoRoot = REPO_ROOT,
  env = process.env,
}: {
  profile: LoadedProfile;
  repoRoot?: string;
  env?: Readonly<Record<string, string | undefined>>;
}) {
  if (isRelease(env)) {
    const refused = undeployableProfileErrors(profile);
    if (refused.length > 0) throw new BrandConfigError(refused);
  }
  const file = join(repoRoot, FIREBASERC);
  const content = firebasercContent(profile.brand);
  // Rewriting an identical file would bump its mtime on every install for nothing.
  const written = !existsSync(file) || readFileSync(file, "utf8") !== content;
  if (written) writeFileSync(file, content);
  return { slug: profile.slug, projectId: profile.brand.firebase.projectId, written };
}

if (import.meta.main) {
  await runCli("brand:apply", {}, (profile) => {
    const result = applyProfile({ profile });
    console.log(
      `brand:apply: ${FIREBASERC} ${result.written ? "written" : "up to date"} for profile "${result.slug}" (project ${result.projectId}).`,
    );
  });
}
