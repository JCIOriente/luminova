import { formatRemedies, uniqueRemedies, type Problem, type Remedy } from "./remedy.ts";

/**
 * Every problem at once, then what to do about them. The message carries the "To fix:"
 * block, so any caller that prints it (a CLI, Vite during `pnpm dev`) shows the remedies.
 */
export class BrandConfigError extends Error {
  readonly errors: string[];
  readonly remedies: Remedy[];

  constructor(problems: readonly (string | Problem)[], remedies: readonly Remedy[] = []) {
    const errors = problems.map((problem) =>
      typeof problem === "string" ? problem : problem.message,
    );
    const all = uniqueRemedies([
      ...problems.flatMap((problem) =>
        typeof problem === "string" ? [] : (problem.remedies ?? []),
      ),
      ...remedies,
    ]);
    const fix = formatRemedies(all);
    super(
      `Brand profile error:\n${errors.map((error) => `  - ${error}`).join("\n")}${fix ? `\n${fix}` : ""}`,
    );
    this.name = "BrandConfigError";
    this.errors = errors;
    this.remedies = all;
  }
}

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** The parts of a zod issue the messages read. */
export interface SchemaIssue {
  path: readonly PropertyKey[];
  message: string;
  code?: string;
  keys?: readonly string[];
  input?: unknown;
}

/**
 * One `<where>: <what>` line per problem in a schema issue, the common ones in plain words;
 * `where` names the location of a path (a file and key, the way that file writes it).
 */
export function issueLines(
  issue: SchemaIssue,
  where: (path: readonly PropertyKey[]) => string,
): string[] {
  const line = (path: readonly PropertyKey[], text: string) => `${where(path)}: ${text}`;
  if (issue.code === "unrecognized_keys" && issue.keys) {
    return issue.keys.map((key) => line([...issue.path, key], "unknown key (a typo?)"));
  }
  if (issue.code === "invalid_type" && issue.input === undefined) {
    return [line(issue.path, "required")];
  }
  if (issue.code === "too_small" && typeof issue.input === "string") {
    return [line(issue.path, "must not be blank")];
  }
  return [line(issue.path, issue.message)];
}
