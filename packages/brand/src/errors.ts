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
