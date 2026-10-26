import { fileURLToPath } from "node:url";
import { flagUsage, flagValue, unexpectedArguments, type Flags } from "../argv.ts";
import { BEFORE_YOU_START, formatNext, formatRemedies, guideStep, type Remedy } from "../remedy.ts";
import { runCommand } from "./gcloud.ts";
import { rowRemedies } from "./rows.ts";
import { formatTable, plural } from "./table.ts";
import { PART_TITLES, nativeWindows, toolRows, type Part, type ToolRow } from "./tools.ts";

/**
 * `pnpm brand:setup [--part try|live]`: the tools each part of docs/adopting.md needs, and
 * how to install what is missing. Only reads (spec docs/specs/2026-10-25-brand-setup.md).
 * Runs before `pnpm install`, so nothing here may import an npm package (S4).
 */
const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

const PARTS: readonly Part[] = ["try", "live"];

const isPart = (value: string): value is Part => PARTS.some((part) => part === value);

const FLAGS: Flags = { values: { "--part": PARTS.join("|") } };

export function parseParts(argv: readonly string[]): Part[] {
  const unexpected = unexpectedArguments(argv, FLAGS);
  if (unexpected.length > 0) {
    throw new Error(`${unexpected.join("; ")}. brand:setup takes ${flagUsage(FLAGS)}.`);
  }
  const value = flagValue(argv, "--part", (message) => new Error(message));
  if (value === undefined) return [...PARTS];
  if (!isPart(value)) throw new Error(`--part is "try" or "live", not "${value}".`);
  return [value];
}

const NEXT: Readonly<Record<Part, Remedy>> = {
  try: {
    change: `try it with the example (${guideStep("example")})`,
    run: "pnpm install && pnpm dev",
  },
  live: { change: `when your chapter is ready to go live: ${guideStep("firebaseProject")}` },
};

export function setupReport(
  rows: readonly ToolRow[],
  parts: readonly Part[],
): { text: string; failed: number } {
  const tables = parts.map((part) =>
    [
      PART_TITLES[part],
      formatTable([
        ["CHECK", "STATUS", "FOUND"],
        ...rows
          .filter((row) => row.part === part)
          .map(({ check, status, detail }) => [check, status, detail]),
      ]),
    ].join("\n"),
  );
  const failed = rows.filter(({ status }) => status === "fail").length;
  const fix = formatRemedies(rowRemedies(rows));
  const next = failed === 0 ? formatNext(parts.map((part) => NEXT[part])) : "";
  return { text: [...tables, fix, next].filter(Boolean).join("\n\n"), failed };
}

if (import.meta.main) {
  let parts: Part[];
  try {
    parts = parseParts(process.argv.slice(2));
  } catch (error) {
    console.error(`brand:setup: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const windows = nativeWindows();
  if (windows) {
    console.error(`brand:setup: ${windows.detail}.\n\n${formatRemedies(windows.remedies ?? [])}`);
    process.exit(1);
  }
  const rows = await toolRows({ parts, repoRoot: REPO_ROOT, run: runCommand });
  const { text, failed } = setupReport(rows, parts);
  console.log(text);
  if (failed > 0) {
    console.error(
      `\nbrand:setup: ${plural(failed, "check")} failed. Every install command, per OS: ${BEFORE_YOU_START}.`,
    );
    process.exit(1);
  }
}
