import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BrandConfigError, REPO_ROOT, loadProfile } from "../load-profile.ts";
import type { Brand } from "../schema.ts";

const FIREBASERC = ".firebaserc";

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

export function applyProfile({
  repoRoot = REPO_ROOT,
  env = process.env,
}: {
  repoRoot?: string;
  env?: Readonly<Record<string, string | undefined>>;
} = {}) {
  const profile = loadProfile({ repoRoot, env });
  const file = join(repoRoot, FIREBASERC);
  const content = `${JSON.stringify(renderFirebaserc(profile.brand), null, 2)}\n`;
  // Rewriting an identical file would bump its mtime on every install for nothing.
  const written = !existsSync(file) || readFileSync(file, "utf8") !== content;
  if (written) writeFileSync(file, content);
  return {
    slug: profile.slug,
    projectId: profile.brand.firebase.projectId,
    warnings: profile.warnings,
    written,
  };
}

if (import.meta.main) {
  try {
    const result = applyProfile();
    for (const warning of result.warnings) console.warn(`brand:apply: ${warning}`);
    console.log(
      `brand:apply: ${FIREBASERC} ${result.written ? "written" : "up to date"} for profile "${result.slug}" (project ${result.projectId}).`,
    );
  } catch (error) {
    if (!(error instanceof BrandConfigError)) throw error;
    console.error(error.message);
    process.exit(1);
  }
}
