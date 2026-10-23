import { flagValue } from "./argv.ts";

/**
 * Which Google Cloud project a script targets. One rule for every script: each explicit
 * source that is set must name the same project, so no precedence order can quietly pick
 * one over another. Callers decide what happens when none is set.
 */

/** The names firebase-tools, firebase-admin and google-github-actions/auth export. */
const PROJECT_ENV_KEYS = ["GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT"] as const;

export type ProjectSource = readonly [label: string, project: string];

export class ProjectTargetError extends Error {
  override name = "ProjectTargetError";
}

/** The given env keys that are set, in order; each caller names the keys it trusts. */
export function envProjectSources(
  env: Readonly<Record<string, string | undefined>>,
  keys: readonly string[] = PROJECT_ENV_KEYS,
): ProjectSource[] {
  return keys.flatMap((key) => {
    const value = env[key]?.trim();
    return value ? [[key, value] as const] : [];
  });
}

export function agreedProject(sources: readonly ProjectSource[]): string | undefined {
  const projects = new Set(sources.map(([, project]) => project));
  if (projects.size > 1) {
    throw new ProjectTargetError(
      `Refusing to run: the project sources disagree (${sources.map(([label, project]) => `${label}=${project}`).join(", ")}).`,
    );
  }
  return sources[0]?.[1];
}

export function parseProjectFlag(argv: readonly string[]): string | undefined {
  return flagValue(argv, "--project", (message) => new ProjectTargetError(message));
}
