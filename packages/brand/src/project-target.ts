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

export function envProjectSources(
  env: Readonly<Record<string, string | undefined>>,
  extraKeys: readonly string[] = [],
): ProjectSource[] {
  return [...PROJECT_ENV_KEYS, ...extraKeys].flatMap((key) => {
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
  for (const [index, arg] of argv.entries()) {
    if (arg.startsWith("--project=")) return arg.slice("--project=".length);
    if (arg === "--project") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new ProjectTargetError("--project needs an id.");
      return value;
    }
  }
  return undefined;
}
