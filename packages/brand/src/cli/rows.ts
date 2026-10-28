import { formatRemedies, uniqueRemedies, type Remedy } from "../remedy.ts";
import { formatTable } from "./table.ts";

/** One line of a `brand:check` section. */
export interface CheckRow {
  check: string;
  status: "ok" | "warn" | "fail" | "skip";
  detail: string;
  remedies?: readonly Remedy[];
}

export interface Section {
  title: string;
  rows: CheckRow[];
}

/** Each title over its rows; the columns line up across every section. */
export function formatSections(sections: readonly Section[]): string {
  const lines = formatTable(
    sections.flatMap(({ rows }) =>
      rows.map(({ check, status, detail }) => [check, status, detail]),
    ),
  ).split("\n");
  let next = 0;
  return sections
    .map(({ title, rows }) => [title, ...rows.map(() => `  ${lines[next++] ?? ""}`)].join("\n"))
    .join("\n\n");
}

const row =
  (status: CheckRow["status"]) =>
  (check: string, detail: string, remedies?: readonly Remedy[]): CheckRow => ({
    check,
    status,
    detail,
    remedies,
  });

export const ok = row("ok");
export const warn = row("warn");
export const fail = row("fail");
export const skip = row("skip");

/**
 * Sections, then one "To fix:" block for them, and how many rows failed: what brand:check
 * prints, and brand:push for its images.
 */
export function formatReport(sections: readonly Section[]): { text: string; failures: number } {
  const rows = sections.flatMap((section) => section.rows);
  const fix = formatRemedies(rowRemedies(rows));
  return {
    text: [formatSections(sections), fix].filter(Boolean).join("\n\n"),
    failures: rows.filter(({ status }) => status === "fail").length,
  };
}

/** The remedies of failing and warning rows, each once, in row (fix) order. */
export const rowRemedies = (rows: readonly CheckRow[]): Remedy[] =>
  uniqueRemedies(
    rows
      .filter(({ status }) => status === "fail" || status === "warn")
      .flatMap(({ remedies }) => remedies ?? []),
  );
